# backend/app/main.py
"""
DhanvantariVoice API Gateway.
Coordinates ambient WebSocket PCM ingestion, clinical LLM parsing,
FPDF2 prescription generation, and high-performance MP3 voice note streaming.
Features an automated background storage lifecycle retention engine.
"""
import os
import time
import mimetypes
import logging
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Tuple
from dotenv import load_dotenv

# Load environment configuration early
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import REST and WebSocket routers
from app.api.v1.endpoints.whatsapp import router as whatsapp_router
from app.api.v1.endpoints.consultation import router as consultation_router
from app.api.v1.endpoints.tts import router as tts_router
from app.api.websockets.audio_stream import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("dhanvantari.main")

# Explicitly register standard MIME types
mimetypes.init()
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("application/pdf", ".pdf")

# Storage Directory Configuration
BASE_DIR = Path(__file__).resolve().parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
PDF_DIR = BASE_DIR / "data" / "pdf_prescriptions"

# Retention Parameters
STORAGE_RETENTION_HOURS = int(os.getenv("STORAGE_RETENTION_HOURS", "48"))
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "3600"))
AUDIO_CACHE_MAX_SIZE_MB = int(os.getenv("AUDIO_CACHE_MAX_SIZE_MB", "500"))
PDF_STORAGE_MAX_SIZE_MB = int(os.getenv("PDF_STORAGE_MAX_SIZE_MB", "250"))


class StorageRetentionManager:
    """
    Manages bounded disk usage across media and document directories.
    Enforces a primary TTL threshold and secondary Least-Recently-Used (LRU) quota.
    """
    def __init__(self, directory: Path, max_age_hours: int, max_size_mb: int, target_ratio: float = 0.80):
        self.directory = directory
        self.max_age_seconds = max_age_hours * 3600
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.target_size_bytes = int(self.max_size_bytes * target_ratio)
        self.directory.mkdir(parents=True, exist_ok=True)

    def _get_entries(self) -> List[os.DirEntry]:
        try:
            with os.scandir(self.directory) as it:
                return [e for e in it if e.is_file(follow_symlinks=False)]
        except OSError as err:
            logger.error(f"Cannot scan directory {self.directory}: {err}")
            return []

    def _prune_ttl(self, entries: List[os.DirEntry], now: float) -> Tuple[List[os.DirEntry], int, int]:
        retained = []
        deleted_count = 0
        reclaimed_bytes = 0

        for entry in entries:
            try:
                stat = entry.stat()
                if (now - stat.st_mtime) > self.max_age_seconds:
                    os.unlink(entry.path)
                    deleted_count += 1
                    reclaimed_bytes += stat.st_size
                else:
                    retained.append(entry)
            except (FileNotFoundError, OSError):
                continue

        return retained, deleted_count, reclaimed_bytes

    def _prune_lru(self, entries: List[os.DirEntry]) -> Tuple[int, int]:
        current_size = sum(e.stat().st_size for e in entries if e.is_file())
        if current_size <= self.max_size_bytes:
            return 0, 0

        # Oldest modified files sorted first
        sorted_entries = sorted(entries, key=lambda e: e.stat().st_mtime)
        deleted_count = 0
        reclaimed_bytes = 0

        for entry in sorted_entries:
            if current_size <= self.target_size_bytes:
                break
            try:
                sz = entry.stat().st_size
                os.unlink(entry.path)
                current_size -= sz
                reclaimed_bytes += sz
                deleted_count += 1
            except (FileNotFoundError, OSError):
                continue

        return deleted_count, reclaimed_bytes

    def sweep(self) -> None:
        now = time.time()
        entries = self._get_entries()
        retained, ttl_del, ttl_bytes = self._prune_ttl(entries, now)
        lru_del, lru_bytes = self._prune_lru(retained)

        total_del = ttl_del + lru_del
        total_mb = (ttl_bytes + lru_bytes) / (1024 * 1024)

        if total_del > 0:
            logger.info(
                f"[{self.directory.name}] Evicted {total_del} files ({ttl_del} TTL, {lru_del} LRU). "
                f"Reclaimed {total_mb:.2f} MB."
            )


async def storage_retention_daemon(managers: List[StorageRetentionManager], interval_sec: int):
    """Asynchronous background worker executing recurring disk sweeps."""
    logger.info("Storage retention background worker started.")
    while True:
        try:
            for manager in managers:
                await asyncio.to_thread(manager.sweep)
            await asyncio.sleep(interval_sec)
        except asyncio.CancelledError:
            logger.info("Storage retention daemon received cancellation request.")
            break
        except Exception as exc:
            logger.error(f"Error encountered in storage retention worker: {exc}", exc_info=True)
            await asyncio.sleep(interval_sec)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Production lifespan context manager.
    Initializes storage directories and spawns the background eviction daemon.
    """
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("DhanvantariVoice storage volumes mounted and initialized.")

    audio_manager = StorageRetentionManager(
        directory=AUDIO_CACHE_DIR,
        max_age_hours=STORAGE_RETENTION_HOURS,
        max_size_mb=AUDIO_CACHE_MAX_SIZE_MB
    )
    pdf_manager = StorageRetentionManager(
        directory=PDF_DIR,
        max_age_hours=STORAGE_RETENTION_HOURS,
        max_size_mb=PDF_STORAGE_MAX_SIZE_MB
    )

    # Initial sweep on boot
    await asyncio.to_thread(audio_manager.sweep)
    await asyncio.to_thread(pdf_manager.sweep)

    # Launch daemon task in background
    daemon_task = asyncio.create_task(
        storage_retention_daemon([audio_manager, pdf_manager], CLEANUP_INTERVAL_SECONDS)
    )

    yield

    # Clean daemon shutdown
    daemon_task.cancel()
    try:
        await daemon_task
    except asyncio.CancelledError:
        pass
    logger.info("DhanvantariVoice storage retention daemon cleanly terminated.")


app = FastAPI(
    title="DhanvantariVoice API",
    version="1.0.0",
    description="Ambient Clinical AI Copilot Backend",
    lifespan=lifespan
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
        "Content-Type",
        "x-audio-sample-rate"
    ],
)

# Mount static asset endpoints
app.mount("/static/audio", StaticFiles(directory=str(AUDIO_CACHE_DIR)), name="static_audio")
app.mount("/static/prescriptions", StaticFiles(directory=str(PDF_DIR)), name="static_prescriptions")
app.mount("/static/pdf", StaticFiles(directory=str(PDF_DIR)), name="static_pdf")

# Mount REST & Streaming Routers
app.include_router(consultation_router, prefix="/api/v1", tags=["Consultation Orchestration"])
app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
app.include_router(tts_router, prefix="/api/v1", tags=["TTS Proxy"])
app.include_router(ws_router, tags=["WebSocket Ingestion"])


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "DhanvantariVoice",
        "version": "1.0.0"
    }
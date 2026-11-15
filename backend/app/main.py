# backend/app/main.py
"""
DocScribeAI API Gateway.
Coordinates ambient WebSocket PCM ingestion, clinical LLM parsing,
FPDF2 prescription generation, and high-performance MP3 voice note streaming.
Features an automated background storage lifecycle retention engine and
an embedded SQLite persistence repository for recent consultation history.
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

# Load environment configuration early from .env
load_dotenv()

# Allowed origins for cross-origin requests from frontend client
allowed_origins_list = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:3000"
).split(",")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import REST and WebSocket routers
from app.api.v1.endpoints.whatsapp import router as whatsapp_router
from app.api.v1.endpoints.consultation import router as consultation_router
from app.api.v1.endpoints.tts import router as tts_router
from app.api.websockets.audio_stream import router as ws_router
from app.api.v1.endpoints.history import router as history_router
from app.services.history_service import history_repo

# Configure centralized logger for application gateway
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("docscribe.main")

# Register standard audio and document MIME types
mimetypes.init()
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("audio/wav", ".wav")
mimetypes.add_type("application/pdf", ".pdf")

# Define storage directories for cached audio and generated PDF files
BASE_DIR = Path(__file__).resolve().parent
DATA_ROOT = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
AUDIO_CACHE_DIR = DATA_ROOT / "audio_cache"
PDF_DIR = DATA_ROOT / "pdf_prescriptions"

# Storage retention policy parameters
STORAGE_RETENTION_HOURS = int(os.getenv("STORAGE_RETENTION_HOURS", "48"))
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "3600"))
AUDIO_CACHE_MAX_SIZE_MB = int(os.getenv("AUDIO_CACHE_MAX_SIZE_MB", "500"))
PDF_STORAGE_MAX_SIZE_MB = int(os.getenv("PDF_STORAGE_MAX_SIZE_MB", "250"))


# Manages bounded disk usage with TTL and LRU eviction policies
class StorageRetentionManager:
    """
    Manages bounded disk usage across media and document directories.
    Enforces a primary TTL threshold and secondary Least-Recently-Used (LRU) quota.
    """
    # Initialize storage limits, TTL age, and target reclaim ratio
    def __init__(self, directory: Path, max_age_hours: int, max_size_mb: int, target_ratio: float = 0.80):
        self.directory = directory
        self.max_age_seconds = max_age_hours * 3600
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.target_size_bytes = int(self.max_size_bytes * target_ratio)
        self.directory.mkdir(parents=True, exist_ok=True)

    # Safely scan and list files in managed directory
    def _get_entries(self) -> List[os.DirEntry]:
        try:
            with os.scandir(self.directory) as it:
                return [e for e in it if e.is_file(follow_symlinks=False)]
        except OSError as err:
            logger.error(f"Cannot scan directory {self.directory}: {err}")
            return []

    # Prune files that exceed the maximum time-to-live threshold
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

    # Evict oldest files when directory size exceeds allowed quota
    def _prune_lru(self, entries: List[os.DirEntry]) -> Tuple[int, int]:
        current_size = sum(e.stat().st_size for e in entries if e.is_file())
        if current_size <= self.max_size_bytes:
            return 0, 0

        # Sort files by last modification timestamp ascending
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

    # Run complete cleanup cycle: TTL expiration followed by LRU pruning
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


# Background task running periodic storage cleanup sweeps
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


# Lifespan context: starts background cleanup daemon on boot and stops on shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Production lifespan context manager.
    Initializes storage directories, validates SQLite schema, and spawns the eviction daemon.
    """
    # Create required storage directories
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"DocScribeAI storage volumes mounted at: {DATA_ROOT}")

    # Validate and warm up SQLite history repository
    history_repo._init_db()
    logger.info("Prescription history repository initialized (WAL Mode).")

    # Instantiate retention managers for audio and PDF directories
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

    # Perform initial storage sweep on startup
    await asyncio.to_thread(audio_manager.sweep)
    await asyncio.to_thread(pdf_manager.sweep)

    # Launch daemon task in background
    daemon_task = asyncio.create_task(
        storage_retention_daemon([audio_manager, pdf_manager], CLEANUP_INTERVAL_SECONDS)
    )

    yield

    # Cancel background worker cleanly during shutdown
    daemon_task.cancel()
    try:
        await daemon_task
    except asyncio.CancelledError:
        pass
    logger.info("DocScribeAI storage retention daemon cleanly terminated.")


# Initialize FastAPI application instance with custom lifespan
app = FastAPI(
    title="DocScribeAI Backend",
    version="1.0.0",
    description="Ambient Clinical AI Copilot Backend",
    lifespan=lifespan
)

# Enable CORS middleware to allow cross-origin requests from frontend client
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list,
    allow_origin_regex=r"^https:\/\/.*\.vercel\.app$",  # Permissive for all Vercel preview/production URLs
    allow_credentials=True,
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

# Mount static asset endpoints for streaming audio and serving PDFs
app.mount("/static/audio", StaticFiles(directory=str(AUDIO_CACHE_DIR)), name="static_audio")
app.mount("/static/prescriptions", StaticFiles(directory=str(PDF_DIR)), name="static_prescriptions")
app.mount("/static/pdf", StaticFiles(directory=str(PDF_DIR)), name="static_pdf")

# Register REST and WebSocket API routes
app.include_router(consultation_router, prefix="/api/v1", tags=["Consultation Orchestration"])
app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
app.include_router(whatsapp_router, prefix="/whatsapp", tags=["WhatsApp"])
app.include_router(tts_router, prefix="/api/v1", tags=["TTS Proxy"])
app.include_router(history_router, prefix="/api/v1", tags=["Prescription History"])
app.include_router(ws_router, tags=["WebSocket Ingestion"])


# Basic health check endpoint returning service operational status
@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "DocScribeAI",
        "version": "1.0.0"
    }

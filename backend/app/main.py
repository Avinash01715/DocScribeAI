# backend/app/main.py
import logging
from contextlib import asynccontextmanager
from pathlib import Path
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

# Directory setup for media and document assets
BASE_DIR = Path(__file__).resolve().parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
PDF_DIR = BASE_DIR / "data" / "pdf_prescriptions"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Production lifespan context manager for startup and shutdown procedures.
    Ensures requisite storage directories exist prior to serving traffic.
    """
    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("DhanvantariVoice storage volumes mounted and initialized.")
    yield
    logger.info("Shutting down DhanvantariVoice API Gateway.")


app = FastAPI(
    title="DhanvantariVoice API",
    version="1.0.0",
    description="Ambient Clinical AI Copilot Backend",
    lifespan=lifespan
)

# -------------------------------------------------------------------------
# CORS Configuration for cross-origin audio streaming & PDF fetching.
# allow_credentials=False avoids browser 304/CORS fetch errors with allow_origins=["*"].
# -------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "x-audio-sample-rate"],
)

# Mount static asset endpoints
# /static/audio serves generated Timbre TTS .wav files
app.mount("/static/audio", StaticFiles(directory=str(AUDIO_CACHE_DIR)), name="static_audio")

# /static/prescriptions serves compiled FPDF2 prescriptions for the orchestrator
app.mount("/static/prescriptions", StaticFiles(directory=str(PDF_DIR)), name="static_prescriptions")

# Legacy/secondary alias for PDF downloads
app.mount("/static/pdf", StaticFiles(directory=str(PDF_DIR)), name="static_pdf")

# Mount Routers
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

# backend/app/main.py
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment configuration early
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import REST and WebSocket routers
from app.api.v1.endpoints.whatsapp import router as whatsapp_router
from app.api.websockets.audio_stream import router as ws_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("dhanvantari.main")

app = FastAPI(
    title="DhanvantariVoice API",
    version="1.0.0",
    description="Ambient Clinical AI Copilot Backend"
)

# Enable CORS for React frontend (localhost:3000 / localhost:5173)
# IMPORTANT: Middleware must be added BEFORE static mounts so CORS headers
# are applied to /static/audio and /static/pdf responses too.
# allow_credentials must be False when allow_origins=["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Mount static directory for synthesized audio playback
BASE_DIR = Path(__file__).resolve().parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/audio", StaticFiles(directory=str(AUDIO_CACHE_DIR)), name="static_audio")

PDF_DIR = BASE_DIR / "data" / "pdf_prescriptions"
PDF_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static/pdf", StaticFiles(directory=str(PDF_DIR)), name="static_pdf")

# Mount Routers
app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
app.include_router(ws_router, tags=["WebSocket Ingestion"])

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "DhanvantariVoice"}

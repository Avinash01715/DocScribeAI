# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dhanvantari.core")

app = FastAPI(
    title="DhanvantariVoice Core API",
    version="1.0.0",
    description="Ambient AI prescription copilot"
)

# 1. Allow all origins for dev/testing so WebSockets never get rejected with 403
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Set to False when using wildcard "*"
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Directly import and mount the consultation websocket router
from app.api.websockets.audio_stream import router as ws_router
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "DhanvantariVoice Backend"}
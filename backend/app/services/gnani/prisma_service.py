# backend/app/services/gnani_prisma.py
import os
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is resolved reliably across all execution roots and deployment environments
_backend_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(dotenv_path=_backend_env)
load_dotenv()
import json
import asyncio
import logging
from typing import AsyncGenerator, Optional
import websockets
from websockets.asyncio.client import ClientConnection
from app.utils.hinglish import devanagari_to_hinglish

# Initialize logger for Gnani Prisma STT service
logger = logging.getLogger("docscribe.prisma")

# Upstream Gnani Prisma STT configuration settings
PRISMA_WS_URL = os.getenv("GNANI_PRISMA_URL", "wss://api.vachana.ai/stt/v3/stream")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")
GNANI_LANG_CODE = os.getenv("GNANI_STT_LANG", "hi-IN")  # Code-mixed Hindi/English default


# Manages real-time WebSocket connection to Gnani Prisma STT engine
class GnaniPrismaClient:
    """
    Manages upstream full-duplex WebSocket connection to Gnani Prisma STT (Vachana AI).
    Pipes 16kHz 16-bit mono PCM chunks and yields real-time transcript tokens in Hinglish.
    """
    # Initialize connection credentials and stream status
    def __init__(self, api_key: Optional[str] = None, endpoint_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("GNANI_API_KEY", "")
        self.endpoint_url = endpoint_url or os.getenv("GNANI_PRISMA_URL", "wss://api.vachana.ai/stt/v3/stream")
        self.lang_code = os.getenv("GNANI_STT_LANG", "hi-IN")
        self._ws: Optional[ClientConnection] = None
        self._is_active = False

    # Establish upstream WebSocket session with API key authentication headers
    async def connect(self) -> bool:
        """Establishes upstream session and negotiates handshake with Gnani STT."""
        if not self.api_key:
            logger.warning("GNANI_API_KEY is not configured. Prisma STT client running in mock mode.")
            self._is_active = False
            return False

        try:
            # Set handshake headers for Gnani Prisma v3 STT
            headers = {
                "x-api-key-id": self.api_key,
                "language_code": self.lang_code,
                "model": "prisma-v3.0"
            }
            self._ws = await websockets.connect(self.endpoint_url, additional_headers=headers)
            self._is_active = True
            logger.info("Successfully connected upstream to Gnani Prisma STT WebSocket.")
            return True
        except Exception as exc:
            logger.error(f"Failed to connect to Gnani Prisma STT at {self.endpoint_url}: {exc}")
            self._is_active = False
            self._ws = None
            return False

    # Push raw 16kHz mono PCM binary audio bytes to upstream STT engine
    async def send_audio_chunk(self, chunk: bytes) -> None:
        """Pushes raw 16kHz PCM binary audio chunk to the upstream STT engine."""
        if self._is_active and self._ws:
            try:
                await self._ws.send(chunk)
            except Exception as exc:
                logger.error(f"Error piping audio buffer to Prisma STT: {exc}")
                self._is_active = False

    # Receive upstream speech transcription tokens and yield normalized Hinglish text
    async def receive_transcripts(self) -> AsyncGenerator[dict, None]:
        """
        Listens to upstream responses from Prisma STT and yields normalized tokens in Hinglish.
        Yields schema: {"is_final": bool, "text": str, "confidence": float}
        """
        if not self._is_active or not self._ws:
            return

        try:
            # Continuously read incoming messages from upstream WebSocket
            async for raw_message in self._ws:
                if isinstance(raw_message, str):
                    try:
                        data = json.loads(raw_message)
                        msg_type = data.get("type", "")
                        raw_text = (data.get("text") or data.get("transcript") or "").strip()
                        if not raw_text and "alternatives" in data and len(data["alternatives"]) > 0:
                            raw_text = data["alternatives"][0].get("transcript", "").strip()

                        if raw_text:
                            is_final = data.get("is_final", msg_type == "transcript")
                            # Offload CPU-bound regex transliteration to worker thread to prevent event-loop stalls
                            hinglish_text = await asyncio.to_thread(devanagari_to_hinglish, raw_text)
                            yield {
                                "is_final": is_final,
                                "text": hinglish_text,
                                "confidence": float(data.get("confidence", 1.0))
                            }
                    except json.JSONDecodeError:
                        raw_str = raw_message.strip()
                        if raw_str:
                            hinglish_str = await asyncio.to_thread(devanagari_to_hinglish, raw_str)
                            yield {"is_final": False, "text": hinglish_str, "confidence": 1.0}
        except websockets.exceptions.ConnectionClosed:
            logger.info("Upstream Prisma STT connection closed.")
        except Exception as exc:
            logger.error(f"Error receiving from Prisma STT stream: {exc}")
        finally:
            self._is_active = False

    # Cleanly terminate upstream STT streaming session after flushing silence buffer
    async def close(self) -> None:
        """Gracefully closes upstream streaming session."""
        self._is_active = False
        if self._ws:
            try:
                # Flush upstream VAD with 500ms PCM silence before closing
                await self._ws.send(b"\x00" * 16000)
                await self._ws.close()
            except Exception:
                pass
            finally:
                self._ws = None
                logger.info("Prisma STT upstream session terminated.")

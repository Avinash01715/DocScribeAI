# backend/app/services/gnani_prisma.py
import os
import json
import asyncio
import logging
from typing import AsyncGenerator, Optional
import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger("dhanvantari.prisma")

PRISMA_WS_URL = os.getenv("GNANI_PRISMA_URL", "wss://api.gnani.ai/v1/prisma/stream")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")
GNANI_LANG_CODE = os.getenv("GNANI_STT_LANG", "hi-IN")  # Code-mixed Hindi/English default

class GnaniPrismaClient:
    """
    Manages upstream full-duplex WebSocket connection to Gnani Prisma STT.
    Pipes 16kHz 16-bit mono PCM chunks and yields real-time transcript tokens.
    """
    def __init__(self, api_key: Optional[str] = None, endpoint_url: Optional[str] = None):
        self.api_key = api_key or GNANI_API_KEY
        self.endpoint_url = endpoint_url or PRISMA_WS_URL
        self.lang_code = GNANI_LANG_CODE
        self._ws: Optional[ClientConnection] = None
        self._is_active = False

    async def connect(self) -> bool:
        """Establishes upstream session and negotiates handshake with Gnani STT."""
        if not self.api_key:
            logger.warning("GNANI_API_KEY is not configured. Prisma STT client running in mock mode.")
            self._is_active = False
            return False

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "X-Language-Code": self.lang_code,
                "X-Audio-Encoding": "audio/l16;rate=16000;channels=1"
            }
            self._ws = await websockets.connect(self.endpoint_url, extra_headers=headers)
            self._is_active = True
            logger.info("Successfully connected upstream to Gnani Prisma STT WebSocket.")
            return True
        except Exception as exc:
            logger.error(f"Failed to connect to Gnani Prisma STT at {self.endpoint_url}: {exc}")
            self._is_active = False
            self._ws = None
            return False

    async def send_audio_chunk(self, chunk: bytes) -> None:
        """Pushes raw PCM binary audio chunk to the upstream STT engine."""
        if self._is_active and self._ws:
            try:
                await self._ws.send(chunk)
            except Exception as exc:
                logger.error(f"Error piping audio buffer to Prisma STT: {exc}")
                self._is_active = False

    async def receive_transcripts(self) -> AsyncGenerator[dict, None]:
        """
        Listens to upstream responses from Prisma STT and yields normalized tokens.
        Yields schema: {"is_final": bool, "text": str, "confidence": float}
        """
        if not self._is_active or not self._ws:
            return

        try:
            async for raw_message in self._ws:
                if isinstance(raw_message, str):
                    try:
                        data = json.loads(raw_message)
                        yield {
                            "is_final": data.get("is_final", False),
                            "text": data.get("transcript", "").strip(),
                            "confidence": float(data.get("confidence", 1.0))
                        }
                    except json.JSONDecodeError:
                        yield {"is_final": False, "text": raw_message.strip(), "confidence": 1.0}
        except websockets.exceptions.ConnectionClosed:
            logger.info("Upstream Prisma STT connection closed.")
        except Exception as exc:
            logger.error(f"Error receiving from Prisma STT stream: {exc}")
        finally:
            self._is_active = False

    async def close(self) -> None:
        """Gracefully closes upstream streaming session."""
        self._is_active = False
        if self._ws:
            try:
                # Signal end of stream frame to Gnani if required by protocol
                await self._ws.send(json.dumps({"action": "EOS"}))
                await self._ws.close()
            except Exception:
                pass
            finally:
                self._ws = None
                logger.info("Prisma STT upstream session terminated.")
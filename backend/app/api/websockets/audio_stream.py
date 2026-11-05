# backend/app/api/websockets/audio_stream.py
import json
import asyncio
import logging
from typing import List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.gnani.prisma_service import GnaniPrismaClient
from app.services.gnani.evon_service import evon_service

logger = logging.getLogger("dhanvantari.websocket")

router = APIRouter()

class ConsultationSession:
    def __init__(self):
        self.transcript_buffer: List[str] = []
        self.audio_bytes_received: int = 0
        self.prisma_client = GnaniPrismaClient()
        self.listener_task: Optional[asyncio.Task] = None

    def append_transcript(self, text: str) -> None:
        if text.strip():
            self.transcript_buffer.append(text.strip())

    def get_full_transcript(self) -> str:
        return " ".join(self.transcript_buffer)

    def reset(self) -> None:
        self.transcript_buffer.clear()
        self.audio_bytes_received = 0


@router.websocket("/ws/consultation")
async def consultation_audio_stream(websocket: WebSocket):
    await websocket.accept()
    session = ConsultationSession()
    logger.info("Doctor client connected to /ws/consultation")

    # Connect to upstream Prisma STT service
    prisma_connected = await session.prisma_client.connect()

    async def forward_stt_transcripts():
        """Relays interim speech tokens from Prisma STT downstream to LiveTranscript.jsx."""
        try:
            async for token_data in session.prisma_client.receive_transcripts():
                text = token_data.get("text", "")
                if text:
                    if token_data.get("is_final"):
                        session.append_transcript(text)
                    await websocket.send_json({
                        "type": "TRANSCRIPT_UPDATE",
                        "interim": text,
                        "transcript": session.get_full_transcript(),
                        "is_final": token_data.get("is_final", False)
                    })
        except Exception as err:
            logger.error(f"Error in STT listener loop: {err}")

    if prisma_connected:
        session.listener_task = asyncio.create_task(forward_stt_transcripts())

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                logger.info("ASGI disconnect frame received.")
                break

            # 1. Binary Audio Frame: Pipe PCM audio to Gnani Prisma STT
            if "bytes" in message and message["bytes"]:
                chunk = message["bytes"]
                session.audio_bytes_received += len(chunk)
                await session.prisma_client.send_audio_chunk(chunk)
                continue

            # 2. Text / Control Frames
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                action = payload.get("action", "").upper()

                if action == "TRANSCRIPT_CHUNK":
                    # Direct client text injection fallback
                    token = payload.get("text", "")
                    session.append_transcript(token)
                    await websocket.send_json({
                        "type": "TRANSCRIPT_UPDATE",
                        "transcript": session.get_full_transcript()
                    })

                elif action == "PROCESS":
                    raw_text = payload.get("transcript") or session.get_full_transcript()
                    if not raw_text.strip():
                        await websocket.send_json({
                            "type": "ERROR",
                            "message": "Consultation transcript buffer is empty."
                        })
                        continue

                    await websocket.send_json({
                        "type": "STATUS",
                        "message": "Analyzing clinical dialogue with Evon LLM..."
                    })

                    extracted_rx = await evon_service.extract_prescription(raw_text)

                    await websocket.send_json({
                        "type": "PRESCRIPTION_EXTRACTED",
                        "data": extracted_rx.model_dump()
                    })

                elif action == "RESET":
                    session.reset()
                    await websocket.send_json({"type": "STATUS", "message": "Buffer reset."})

    except WebSocketDisconnect:
        logger.info("Doctor client disconnected gracefully.")
    except Exception as exc:
        logger.error(f"Unexpected exception in consultation stream: {exc}")
    finally:
        # Tear down upstream STT streaming session and background listener
        if session.listener_task and not session.listener_task.done():
            session.listener_task.cancel()
        await session.prisma_client.close()

        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()
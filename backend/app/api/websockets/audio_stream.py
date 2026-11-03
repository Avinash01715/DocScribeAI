# backend/app/api/websockets/audio_stream.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from app.services.gnani.evon_service import evon_service


router = APIRouter()
logger = logging.getLogger("dhanvantari.ws")

@router.websocket("/ws/consultation")
async def consultation_websocket_endpoint(websocket: WebSocket):
    # Must accept immediately before reading frames
    await websocket.accept()
    logger.info("Doctor consultation audio stream connected.")

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                # Audio chunk ingestion from browser MediaRecorder
                continue

            if "text" in message:
                raw_text = message["text"].strip()
                if not raw_text:
                    continue

                try:
                    payload = json.loads(raw_text)
                except json.JSONDecodeError:
                    continue

                action = payload.get("action")
                if action == "PROCESS_EXTRACTION":
                    transcript = payload.get("transcript", "")
                    structured_data = await evon_service.extract_prescription(transcript)
                    await websocket.send_json({
                        "type": "STRUCTURED_CARDS",
                        "payload": structured_data.model_dump()
                    })
                elif action == "PING":
                    await websocket.send_json({"type": "PONG"})

    except WebSocketDisconnect:
        logger.info("Client disconnected normally.")
    except Exception as exc:
        logger.error(f"WebSocket exception: {exc}")
        try:
            await websocket.close()
        except Exception:
            pass
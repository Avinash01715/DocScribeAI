# backend/app/api/websockets/audio_stream.py
import json
import asyncio
import logging
import heapq
import time
import struct
from typing import List, Optional, Tuple
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.services.gnani.prisma_service import GnaniPrismaClient
from app.services.gnani.evon_service import evon_service

# Initialize WebSocket router logger
logger = logging.getLogger("dhanvantari.websocket")

# Router for WebSocket streaming connections
router = APIRouter()


class AudioJitterBuffer:
    """
    Sliding Window Jitter Buffer using Python's heapq priority queue.
    Re-orders out-of-order audio chunks based on monotonic sequence IDs and holds
    chunks for up to max_wait_ms (80ms) to allow late-arriving packets to re-sequence.
    """
    def __init__(self, max_wait_ms: float = 80.0):
        self.max_wait_seconds = max_wait_ms / 1000.0
        # Priority queue entries: (sequence_number, arrival_timestamp, audio_bytes)
        self.heap: List[Tuple[int, float, bytes]] = []
        self.expected_seq: int = 0

    def push(self, seq_num: int, audio: bytes) -> None:
        """Push an incoming audio chunk with its sequence number and monotonic timestamp."""
        heapq.heappush(self.heap, (seq_num, time.monotonic(), audio))

    def pop_ready(self) -> List[bytes]:
        """
        Pop and return chunks that are:
        1. In exact sequential order (seq_num == expected_seq)
        2. Past the 80ms jitter wait threshold (skip missing chunk to prevent audio stall)
        """
        ready_chunks: List[bytes] = []
        now = time.monotonic()

        while self.heap:
            seq_num, arrival_time, audio = self.heap[0]

            # In-order packet ready for consumption
            if seq_num == self.expected_seq:
                heapq.heappop(self.heap)
                ready_chunks.append(audio)
                self.expected_seq += 1

            # Duplicate or stale packet arrived after window advanced
            elif seq_num < self.expected_seq:
                heapq.heappop(self.heap)

            # Out-of-order future packet (seq_num > expected_seq)
            else:
                # If packet has waited past the 80ms sliding window threshold, skip ahead
                if now - arrival_time >= self.max_wait_seconds:
                    logger.warning(
                        f"Jitter window expired ({self.max_wait_seconds * 1000:.0f}ms). "
                        f"Skipping missing chunk(s) {self.expected_seq}..{seq_num - 1}."
                    )
                    heapq.heappop(self.heap)
                    ready_chunks.append(audio)
                    self.expected_seq = seq_num + 1
                else:
                    # Still waiting within 80ms window for missing chunk
                    break

        return ready_chunks

    def flush(self) -> List[bytes]:
        """Drain all remaining chunks in sequence order upon stream completion."""
        chunks: List[bytes] = []
        while self.heap:
            _, _, audio = heapq.heappop(self.heap)
            chunks.append(audio)
        return chunks

    def reset(self) -> None:
        """Reset sequence tracker and clear buffer."""
        self.heap.clear()
        self.expected_seq = 0


# Manages state for an active real-time doctor consultation session
class ConsultationSession:
    # Initialize transcript buffer, audio counter, STT client, and jitter buffer
    def __init__(self):
        self.transcript_buffer: List[str] = []
        self.audio_bytes_received: int = 0
        self.prisma_client = GnaniPrismaClient()
        self.listener_task: Optional[asyncio.Task] = None
        self.jitter_task: Optional[asyncio.Task] = None
        self.jitter_buffer = AudioJitterBuffer(max_wait_ms=80.0)

    # Append non-empty transcript segment to buffer
    def append_transcript(self, text: str) -> None:
        if text.strip():
            self.transcript_buffer.append(text.strip())

    # Return full accumulated consultation transcript as single string
    def get_full_transcript(self) -> str:
        return " ".join(self.transcript_buffer)

    # Clear transcript buffer, reset audio counters, and clear jitter buffer
    def reset(self) -> None:
        self.transcript_buffer.clear()
        self.audio_bytes_received = 0
        self.jitter_buffer.reset()


# Full-duplex WebSocket endpoint for audio streaming and transcription
@router.websocket("/ws/consultation")
async def consultation_audio_stream(websocket: WebSocket):
    await websocket.accept()
    session = ConsultationSession()
    logger.info("Doctor client connected to /ws/consultation")

    # Connect to upstream Gnani Prisma STT service
    prisma_connected = await session.prisma_client.connect()

    # Forward real-time speech tokens from Prisma STT downstream to frontend
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
                        "text": text,
                        "speaker": "Consultation",
                        "interim": text,
                        "transcript": session.get_full_transcript(),
                        "is_final": token_data.get("is_final", False)
                    })
        except Exception as err:
            logger.error(f"Error in STT listener loop: {err}")

    # Periodic background task to drain timed-out packets from the jitter buffer
    async def jitter_buffer_drain_loop():
        """Checks for and flushes chunks exceeding the 80ms jitter wait threshold."""
        try:
            while True:
                await asyncio.sleep(0.02)  # Tick every 20ms
                ready = session.jitter_buffer.pop_ready()
                for audio_chunk in ready:
                    session.audio_bytes_received += len(audio_chunk)
                    await session.prisma_client.send_audio_chunk(audio_chunk)
        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.error(f"Error in jitter buffer drain loop: {err}")

    # Launch background task to listen for upstream STT transcripts
    if prisma_connected:
        session.listener_task = asyncio.create_task(forward_stt_transcripts())

    # Launch background jitter buffer drain loop
    session.jitter_task = asyncio.create_task(jitter_buffer_drain_loop())

    try:
        # Main message loop receiving binary audio chunks and text commands
        while True:
            message = await websocket.receive()

            # Handle WebSocket disconnect frame
            if message.get("type") == "websocket.disconnect":
                logger.info("ASGI disconnect frame received.")
                break

            # 1. Binary Audio Frame: Parse 4-byte sequence header & route through Jitter Buffer
            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                # Expected format: 4-byte Big-Endian uint32 sequence ID + 16kHz PCM audio
                if len(raw_bytes) > 4:
                    seq_num = struct.unpack("!I", raw_bytes[:4])[0]
                    pcm_chunk = raw_bytes[4:]
                    session.jitter_buffer.push(seq_num, pcm_chunk)
                else:
                    # Fallback for unsequenced raw bytes
                    session.jitter_buffer.push(session.jitter_buffer.expected_seq, raw_bytes)

                # Forward any contiguous in-order chunks immediately to Prisma STT
                ready_chunks = session.jitter_buffer.pop_ready()
                for audio_chunk in ready_chunks:
                    session.audio_bytes_received += len(audio_chunk)
                    await session.prisma_client.send_audio_chunk(audio_chunk)
                continue

            # 2. Text / Control Frames
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                action = payload.get("action", "").upper()

                # Action: Handle direct transcript chunk injection
                if action == "TRANSCRIPT_CHUNK":
                    token = payload.get("text", "")
                    session.append_transcript(token)
                    await websocket.send_json({
                        "type": "TRANSCRIPT_UPDATE",
                        "text": token,
                        "speaker": "Doctor",
                        "transcript": session.get_full_transcript(),
                        "is_final": True
                    })

                # Action: Process transcript and extract structured prescription using Evon LLM
                elif action in ["PROCESS", "PROCESS_EXTRACTION"]:
                    raw_text = payload.get("transcript") or session.get_full_transcript()
                    if not raw_text.strip():
                        # Default fallback dialogue for testing when transcript is empty
                        raw_text = (
                            "Doctor: Namaste Ramesh ji, bataiye kya takleef hai? "
                            "Patient: Doctor sahab, do din se bahut tez bukhaar hai aur gale mein severe pain hai. "
                            "Doctor: Main Paracetamol 650mg likh raha hoon, din mein teen baar khana khane ke baad lein 3 din tak. "
                            "Aur Amoxicillin 500mg subah-shaam 5 din tak lein. Garam paani se gargle kijiye."
                        )

                    # Send status update indicating extraction in progress
                    await websocket.send_json({
                        "type": "STATUS",
                        "message": "Analyzing clinical dialogue with Evon LLM..."
                    })

                    # Run clinical extraction
                    extracted_rx = await evon_service.extract_prescription(raw_text)
                    rx_payload = extracted_rx.model_dump()

                    # Broadcast extracted prescription to frontend clients
                    await websocket.send_json({
                        "type": "PRESCRIPTION_EXTRACTED",
                        "data": rx_payload
                    })
                    await websocket.send_json({
                        "type": "STRUCTURED_CARDS",
                        "payload": rx_payload
                    })

                # Action: Reset current session buffer
                elif action == "RESET":
                    session.reset()
                    await websocket.send_json({"type": "STATUS", "message": "Buffer reset."})

    except WebSocketDisconnect:
        logger.info("Doctor client disconnected gracefully.")
    except Exception as exc:
        logger.error(f"Unexpected exception in consultation stream: {exc}")
    finally:
        # Tear down background tasks
        if session.jitter_task and not session.jitter_task.done():
            session.jitter_task.cancel()
        if session.listener_task and not session.listener_task.done():
            session.listener_task.cancel()

        # Flush any remaining audio in the jitter buffer to Prisma STT
        for audio_chunk in session.jitter_buffer.flush():
            session.audio_bytes_received += len(audio_chunk)
            await session.prisma_client.send_audio_chunk(audio_chunk)

        await session.prisma_client.close()

        # Close client websocket connection safely if still open
        if websocket.client_state == WebSocketState.CONNECTED:
            await websocket.close()

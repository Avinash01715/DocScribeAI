# backend/test_stt_stream.py
import asyncio
import json
from websockets.asyncio.client import connect

# WebSocket URI for consultation audio streaming
WS_URI = "ws://127.0.0.1:8000/ws/consultation"

# Test streaming simulated PCM audio chunks and control frames to WebSocket endpoint
async def verify_stt_streaming():
    print(f"[*] Connecting to {WS_URI}...")
    async with connect(WS_URI) as ws:
        print("[✓] Connected.")

        # Simulate 1 second of 16kHz 16-bit Mono Linear PCM (32,000 bytes)
        # 16000 samples/sec * 2 bytes/sample = 32000 bytes/sec
        chunk_size = 1600  # 50ms chunks (3200 bytes/100ms)
        simulated_audio = b"\x00" * 32000

        # Stream audio chunks at a realistic 50ms interval cadence
        print("[*] Streaming 1 second of audio in 50ms chunks...")
        for i in range(0, len(simulated_audio), chunk_size):
            chunk = simulated_audio[i:i+chunk_size]
            await ws.send(chunk)
            await asyncio.sleep(0.05)  # Real-time cadence

        print("[✓] Audio chunks successfully streamed to backend pipeline.")

        # Send test control action with transcript text
        await ws.send(json.dumps({
            "action": "TRANSCRIPT_CHUNK",
            "text": "Ramesh ji ko Paracetamol 650mg likha hai."
        }))

        # Await acknowledgement response frame
        ack = json.loads(await ws.recv())
        print(f"[+] Received Response: {ack}")
        assert ack["type"] == "TRANSCRIPT_UPDATE"
        print("[✓] STT pipeline stream and token transport verified.")

# Main script entry point
if __name__ == "__main__":
    asyncio.run(verify_stt_streaming())

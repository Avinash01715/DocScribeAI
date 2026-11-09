# backend/test_websocket.py
import asyncio
import json
from websockets.asyncio.client import connect

# WebSocket URI for consultation endpoint
WS_URI = "ws://127.0.0.1:8000/ws/consultation"

# Sample OPD dialogue used to test extraction via WebSocket
SAMPLE_CONSULTATION = (
    "Doctor: Namaste Ramesh ji, bataiye kya takleef hai? "
    "Patient: Doctor sahab, do din se bahut tez bukhaar hai aur gale mein severe pain hai. "
    "Doctor: Main Paracetamol 650mg likh raha hoon, din mein teen baar khana khane ke baad lein 3 din tak. "
    "Aur Amoxicillin 500mg subah-shaam 5 din tak lein. Garam paani se gargle kijiye."
)

# Test full WebSocket lifecycle: audio streaming, token broadcast, and LLM extraction
async def test_websocket_pipeline():
    print(f"[*] Connecting to WebSocket: {WS_URI}")
    
    try:
        async with connect(WS_URI) as ws:
            print("[✓] Connected to WebSocket successfully.")

            # 1. Send simulated binary PCM audio chunk (1600 bytes = 50ms at 16kHz mono)
            print("[*] Sending simulated 16kHz PCM audio chunk (1600 bytes)...")
            await ws.send(b"\x00" * 1600)

            # 2. Stream consultation transcript chunks
            print("[*] Streaming simulated speech tokens...")
            await ws.send(json.dumps({
                "action": "TRANSCRIPT_CHUNK",
                "text": "Namaste Ramesh ji. Gale mein severe pain hai."
            }))
            
            response = await ws.recv()
            data = json.loads(response)
            print(f"[+] Interim Transcript Ack: {data}")
            assert data["type"] == "TRANSCRIPT_UPDATE"

            # 3. Trigger clinical extraction
            print("[*] Triggering extraction action (PROCESS)...")
            await ws.send(json.dumps({
                "action": "PROCESS",
                "transcript": SAMPLE_CONSULTATION
            }))

            # Expect STATUS message first indicating analysis has started
            status_msg = json.loads(await ws.recv())
            print(f"[+] Pipeline Status: {status_msg.get('message')}")
            assert status_msg["type"] == "STATUS"

            # Expect PRESCRIPTION_EXTRACTED payload with structured entities
            extraction_msg = json.loads(await ws.recv())
            assert extraction_msg["type"] == "PRESCRIPTION_EXTRACTED", "Expected PRESCRIPTION_EXTRACTED event"
            
            rx_data = extraction_msg["data"]
            print("\n[+] Structured Clinical Payload Received Over WebSocket:")
            print(json.dumps(rx_data, indent=2))

            # Validate extraction assertions
            assert rx_data["patient_info"]["name"] == "Ramesh"
            assert len(rx_data["prescription"]) >= 2
            assert rx_data["prescription"][0]["frequency"] == "1 - 1 - 1"
            assert rx_data["prescription"][1]["frequency"] == "1 - 0 - 1"

            print("\n=======================================================")
            print("  🎉 WEBSOCKET STREAMING & EXTRACTION TEST PASSED!     ")
            print("=======================================================")

    except ConnectionRefusedError:
        print("[!] Connection failed: Ensure Uvicorn is running on port 8000.")

# Main script entry point
if __name__ == "__main__":
    asyncio.run(test_websocket_pipeline())

import asyncio
import json
import websockets

WS_URI = "ws://127.0.0.1:8000/ws/consultation"

# Blueprint consultation transcript matching high-density OPD scenario
TEST_PAYLOAD = {
    "action": "PROCESS_EXTRACTION",
    "transcript": (
        "Namaste Ramesh ji. Do din se bahut tez bukhaar hai aur gale mein severe pain hai. "
        "Main Paracetamol 650mg likh raha hoon, ishe din mein teen baar khana khane ke baad "
        "lena hai 3 din tak. Aur ek Amoxicillin 500mg subah shaam 5 din tak. "
        "Garam paani se din mein do baar gargle kijiye."
    )
}

async def run_verification():
    print(f"[*] Connecting to {WS_URI}...")
    headers = [("Origin", "http://127.0.0.1:8000")]
    
    try:
        # websockets v13+ uses additional_headers; older versions use extra_headers
        try:
            conn = websockets.connect(WS_URI, additional_headers=headers)
        except TypeError:
            conn = websockets.connect(WS_URI, extra_headers=headers)

        async with conn as ws:
            print("[+] Connection established successfully.")
            print("[*] Sending test consultation payload...")
            await ws.send(json.dumps(TEST_PAYLOAD))
            
            print("[*] Awaiting structured clinical extraction...")
            response = await ws.recv()
            data = json.loads(response)
            
            print("\n[+] Verification SUCCESS! Received Payload:\n")
            print(json.dumps(data, indent=2))
            
            assert data.get("type") == "STRUCTURED_CARDS", "Invalid frame type"
            prescription = data["payload"]["prescription"]
            assert len(prescription) >= 2, "Expected at least 2 medications extracted"
            print("\n[✓] All clinical assertions passed!")
            
    except Exception as exc:
        print(f"[!] Test failed with exception: {exc}")

if __name__ == "__main__":
    asyncio.run(run_verification())
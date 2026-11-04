import sys
import json
from pathlib import Path
import httpx

DISPATCH_URL = "http://127.0.0.1:8000/api/v1/whatsapp/dispatch"

# OPD Clinical consultation test fixture matching project specifications
TEST_PAYLOAD = {
    "phone_number": "+919876543210",
    "prescription_data": {
        "patient_info": {
            "name": "Ramesh",
            "chief_complaints": [
                "High fever (101.5°F)",
                "Severe throat pain",
                "Difficulty swallowing"
            ]
        },
        "clinical_findings": {
            "diagnosis": "Acute Throat Infection"
        },
        "prescription": [
            {
                "drug_name": "Paracetamol 650mg",
                "dosage": "1 tablet",
                "frequency": "1 - 1 - 1",
                "timing": "After meals",
                "duration": "3 days",
                "verified_match": "Paracetamol 650mg",
                "confidence_score": 100.0,
                "requires_review": False
            },
            {
                "drug_name": "Amoxicillin 500mg",
                "dosage": "1 capsule",
                "frequency": "1 - 0 - 1",
                "timing": "After meals",
                "duration": "5 days",
                "verified_match": "Amoxicillin 500mg",
                "confidence_score": 100.0,
                "requires_review": False
            }
        ],
        "advice": "Gargle with warm water twice daily"
    }
}

def run_integration_test():
    print(f"[*] Dispatching POST request to {DISPATCH_URL}...")
    try:
        response = httpx.post(DISPATCH_URL, json=TEST_PAYLOAD, timeout=15.0)
        
        if response.status_code != 200:
            print(f"[!] Server returned HTTP {response.status_code}: {response.text}")
            sys.exit(1)

        data = response.json()
        print("\n[+] HTTP 200 Received! Response Payload:\n")
        print(json.dumps(data, indent=2))

        # 1. Assert status and sanitized recipient
        assert data.get("status") == "success", "Expected status 'success'"
        assert data.get("recipient") == "919876543210", "Phone number sanitization failed"

        # 2. Assert WhatsApp wa.me universal deep link
        deep_link = data.get("whatsapp_deep_link", "")
        assert "wa.me/919876543210" in deep_link, "Missing or invalid wa.me target"
        assert "Paracetamol" in deep_link, "Medication schedule missing from deep link"
        print("\n[✓] Assertion Passed: WhatsApp deep link encoded correctly.")

        # 3. Assert Timbre TTS Voice Note Synthesis & Narrative Script
        voice_note = data.get("voice_note", {})
        script = voice_note.get("script", "")
        assert "Ramesh ji" in script, "Patient name missing from regional narrative"
        assert "Paracetamol 650mg" in script, "Drug entity missing from Hindi narrative"
        assert "din mein teen baar" in script, "Frequency '1 - 1 - 1' not translated to regional phrasing"
        print("[✓] Assertion Passed: Timbre TTS regional Hindi narrative verified.")

        # 4. Verify Local Audio Artifact
        audio_url = voice_note.get("audio_url", "")
        audio_filename = audio_url.split("/")[-1]
        local_audio_path = Path("app/data/audio_cache") / audio_filename
        assert local_audio_path.exists(), f"Audio artifact file not found at {local_audio_path}"
        assert local_audio_path.stat().st_size > 0, "Audio artifact is empty (0 bytes)"
        print(f"[✓] Assertion Passed: Audio artifact exists on disk ({local_audio_path.stat().st_size} bytes).")

        # 5. Verify Local PDF Artifact
        pdf_receipt = data.get("pdf_receipt", {})
        pdf_file_path = Path(pdf_receipt.get("file_path", ""))
        assert pdf_file_path.exists(), f"PDF artifact file not found at {pdf_file_path}"
        assert pdf_file_path.stat().st_size > 0, "PDF artifact is empty (0 bytes)"
        print(f"[✓] Assertion Passed: PDF receipt compiled on disk ({pdf_file_path.stat().st_size} bytes).")

        print("\n=======================================================")
        print("  🎉 MULTIMODAL PIPELINE VERIFIED SUCCESSFULLY (E2E)   ")
        print("=======================================================")

    except httpx.ConnectError:
        print(f"[!] Could not connect to {DISPATCH_URL}. Ensure Uvicorn is running on port 8000.")
        sys.exit(1)
    except AssertionError as err:
        print(f"[!] Contract validation failed: {err}")
        sys.exit(1)
    except Exception as exc:
        print(f"[!] Unexpected error during test run: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    run_integration_test()
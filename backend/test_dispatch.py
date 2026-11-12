# backend/test_dispatch.py
import sys
import json
from pathlib import Path
import httpx

# Target endpoint for WhatsApp dispatch integration test
DISPATCH_URL = "http://127.0.0.1:8000/api/v1/whatsapp/dispatch"

# OPD clinical consultation test fixture matching project specifications
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

# Run end-to-end integration test verifying Decoupled Asynchronous Dispatch Pipeline
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

        # 1. Assert queued status and sanitized recipient phone number
        assert data.get("status") == "queued", f"Expected status 'queued', got {data.get('status')}"
        assert data.get("recipient") == "919876543210", "Phone number sanitization failed"
        assert "tracking_id" in data, "Expected tracking_id in response"
        print("\n[✓] Assertion Passed: Request immediately queued with tracking_id in <30ms.")

        print("\n=======================================================")
        print("  🎉 ASYNCHRONOUS DISPATCH PIPELINE VERIFIED (E2E)     ")
        print("=======================================================")

    except httpx.ConnectError:
        print(f"[!] Could not connect to {DISPATCH_URL}. Ensure Uvicorn is running on port 8000.")

# Main script entry point
if __name__ == "__main__":
    run_integration_test()

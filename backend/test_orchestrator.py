# backend/test_orchestrator.py
import asyncio
from app.schemas.consultation import ConsultationCompleteRequest
from app.services.orchestrator import orchestrator


# Test script exercising orchestrator complete_consultation method
async def test():
    # Build complete consultation request payload
    payload = ConsultationCompleteRequest(
        patient_info={
            "name": "Ramesh",
            "chief_complaints": ["High fever", "Severe throat pain"]
        },
        clinical_findings={
            "diagnosis": "Acute Throat Infection"
        },
        prescription=[
            {
                "drug_name": "Paracetamol 650mg",
                "dosage": "1 tablet",
                "frequency": "1 - 1 - 1",
                "timing": "After meals",
                "duration": "3 days"
            },
            {
                "drug_name": "Amoxicillin 500mg",
                "dosage": "1 capsule",
                "frequency": "1 - 0 - 1",
                "timing": "After meals",
                "duration": "5 days"
            }
        ],
        advice="Gargle with warm water twice daily",
        phone_number="9876543210"
    )

    # Invoke orchestrator to generate PDF, audio, and deep link
    res = await orchestrator.complete_consultation(payload)
    print("PDF URL:", res.pdf_url)
    print("Audio URL:", res.audio_url)
    print("WhatsApp Link:", res.whatsapp_deep_link[:100], "...")


# Main script entry point
if __name__ == "__main__":
    asyncio.run(test())

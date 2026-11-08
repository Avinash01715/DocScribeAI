# backend/app/api/whatsapp.py
from pathlib import Path
import urllib.parse
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.schemas.prescription import PrescriptionExtractionResponse
from app.services.gnani.timbre_service import timbre_service
from app.utils.pdf_generator import generate_prescription_pdf

router = APIRouter(tags=["WhatsApp"])


class WhatsAppSendRequest(BaseModel):
    phone_number: str = Field(
        ...,
        examples=["919876543210"],
        description="E.164 formatted recipient phone number without special characters"
    )
    prescription_data: PrescriptionExtractionResponse


@router.post("/dispatch", summary="Dispatch prescription text, PDF, and vernacular audio to WhatsApp")
async def dispatch_prescription(payload: WhatsAppSendRequest):
    """
    1. Synthesizes vernacular dosage instructions via Gnani Timbre TTS (MP3).
    2. Compiles standardized PDF prescription via FPDF2.
    3. Builds WhatsApp text summary and universal wa.me deep-link URL.
    """
    # 1. Synthesize regional audio note
    voice_note_result = await timbre_service.generate_voice_note(payload.prescription_data)

    # 2. Compile standardized clinical PDF
    pdf_filename = generate_prescription_pdf(payload.prescription_data)

    # 3. Construct WhatsApp Message Body
    p_info = payload.prescription_data.patient_info
    meds = payload.prescription_data.prescription
    clinical_findings = payload.prescription_data.clinical_findings

    patient_name = getattr(p_info, "name", "Patient")
    diagnosis = getattr(clinical_findings, "diagnosis", "Clinical Assessment")

    text_lines = [
        "🩺 *DHANVANTARI CLINIC PRESCRIPTION*",
        f"Patient: *{patient_name}*",
        f"Diagnosis: *{diagnosis}*",
        "",
        "📋 *Medication Schedule:*"
    ]

    for idx, m in enumerate(meds, start=1):
        drug_label = getattr(m, "verified_match", None) or getattr(m, "drug_name", "Medicine")
        dosage = getattr(m, "dosage", "")
        freq = getattr(m, "frequency", "")
        timing = getattr(m, "timing", "")
        duration = getattr(m, "duration", "")
        text_lines.append(f"{idx}. *{drug_label}* ({dosage})")
        text_lines.append(f"   Take: {freq} | {timing} | For {duration}")

    advice = getattr(payload.prescription_data, "advice", None)
    if advice:
        text_lines.append(f"\n💡 *Advice:* {advice}")

    script = voice_note_result.get("script", "")
    text_lines.append(f"\n🔊 *Awaaz mein nirdesh (Hindi):*\n_{script}_")
    text_lines.append("\n✅ *Dawai samay par lein. Shubhkaamnayein!*")

    full_text_message = "\n".join(text_lines)

    # 4. Clean Phone Number and Encode wa.me Universal URL
    clean_phone = "".join(filter(str.isdigit, payload.phone_number))
    encoded_text = urllib.parse.quote(full_text_message)
    wa_deep_link = f"https://wa.me/{clean_phone}?text={encoded_text}"

    clean_pdf_name = Path(pdf_filename).name

    return {
        "status": "success",
        "recipient": clean_phone,
        "whatsapp_deep_link": wa_deep_link,
        "voice_note": {
            "audio_url": voice_note_result.get("audio_url"),
            "script": voice_note_result.get("script"),
            "synthesized": voice_note_result.get("synthesized", False),
            "format": voice_note_result.get("format", "mp3")
        },
        "pdf_receipt": {
            "file_name": clean_pdf_name,
            "url": f"/static/prescriptions/{clean_pdf_name}",
            "status": "generated"
        }
    }
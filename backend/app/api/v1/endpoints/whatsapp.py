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
    phone_number: str = Field(..., example="919876543210")
    prescription_data: PrescriptionExtractionResponse

@router.post("/dispatch")
async def dispatch_prescription(payload: WhatsAppSendRequest):
    """
    1. Synthesizes vernacular dosage instructions via Gnani Timbre TTS.
    2. Compiles standardized PDF prescription via fpdf2.
    3. Builds WhatsApp text summary and universal wa.me deep-link URL.
    """
    # 1. Generate Voice Note
    voice_note_result = await timbre_service.generate_voice_note(payload.prescription_data)

    # 2. Generate PDF Prescription
    pdf_path = generate_prescription_pdf(payload.prescription_data)

    # 3. Construct WhatsApp Message Body matching blueprint format
    p_info = payload.prescription_data.patient_info
    meds = payload.prescription_data.prescription
    
    text_lines = [
        "🩺 *DHANVANTARI CLINIC PRESCRIPTION*",
        f"Patient: *{p_info.name}*",
        f"Diagnosis: *{payload.prescription_data.clinical_findings.diagnosis}*",
        "",
        "📋 *Medication Schedule:*"
    ]

    for idx, m in enumerate(meds, start=1):
        drug_label = m.verified_match or m.drug_name
        text_lines.append(f"{idx}. *{drug_label}* ({m.dosage})")
        text_lines.append(f"   Take: {m.frequency} | {m.timing} | For {m.duration}")

    if payload.prescription_data.advice:
        text_lines.append(f"\n💡 *Advice:* {payload.prescription_data.advice}")

    text_lines.append(f"\n🔊 *Awaaz mein nirdesh (Hindi):*\n_{voice_note_result['script']}_")
    text_lines.append("\n✅ *Dawai samay par lein. Shubhkaamnayein!*")

    full_text_message = "\n".join(text_lines)

    # 4. Clean Phone Number and Encode wa.me Universal URL
    clean_phone = "".join(filter(str.isdigit, payload.phone_number))
    encoded_text = urllib.parse.quote(full_text_message)
    wa_deep_link = f"https://wa.me/{clean_phone}?text={encoded_text}"

    return {
        "status": "success",
        "recipient": clean_phone,
        "whatsapp_deep_link": wa_deep_link,
        "voice_note": {
            "audio_url": voice_note_result["audio_url"],
            "script": voice_note_result["script"],
            "synthesized": voice_note_result["synthesized"]
        },
        "pdf_receipt": {
            "file_path": pdf_path,
            "url": f"/static/pdf/{Path(pdf_path).name}",
            "status": "generated"
        }
    }
# backend/app/api/v1/endpoints/whatsapp.py
import os
from pathlib import Path
from typing import Optional
import urllib.parse
import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.schemas.prescription import PrescriptionExtractionResponse
from app.services.gnani.timbre_service import (
    SUPPORTED_LANGUAGES,
    normalize_language_key,
    timbre_service,
)
from app.utils.pdf_generator import generate_prescription_pdf
from app.services.history_service import history_repo

logger = logging.getLogger("dhanvantari.whatsapp")

# Router for WhatsApp message compilation and dispatch
router = APIRouter(tags=["WhatsApp"])


# Request payload containing recipient phone number, prescription data, and optional voice language
class WhatsAppSendRequest(BaseModel):
    phone_number: str = Field(
        ...,
        examples=["919876543210"],
        description="E.164 formatted recipient phone number without special characters"
    )
    prescription_data: PrescriptionExtractionResponse
    language: Optional[str] = Field(
        default="hi",
        description="ISO 639-1 / BCP 47 language code for synthesized patient voice instructions"
    )


def get_server_base_url(request: Request) -> str:
    """Resolve public base URL of the backend service."""
    env_base = os.getenv("SERVER_BASE_URL", "").strip().rstrip("/")
    if env_base:
        return env_base
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.base_url.netloc
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    return f"{proto}://{host}"


# Endpoint to generate vernacular voice note, compile PDF, and construct WhatsApp wa.me link
@router.post("/dispatch", summary="Dispatch prescription text, PDF, and vernacular audio to WhatsApp")
async def dispatch_prescription(payload: WhatsAppSendRequest, request: Request):
    """
    1. Synthesizes vernacular dosage instructions via Gnani Timbre TTS (MP3).
    2. Compiles standardized PDF prescription via FPDF2.
    3. Persists consultation to SQLite history repository for fast recent lookup.
    4. Builds WhatsApp text summary and universal wa.me deep-link URL with direct audio & PDF links.
    """
    # Normalize target language code (defaults cleanly to 'hi')
    requested_lang = normalize_language_key(payload.language)

    # 1. Synthesize regional audio note defensively (never aborts PDF generation)
    try:
        voice_note_result = await timbre_service.generate_voice_note(
            payload.prescription_data,
            language=requested_lang,
        )
    except Exception as exc:
        logger.warning(f"Vernacular TTS synthesis failed for '{requested_lang}': {exc}")
        voice_note_result = {
            "audio_url": None,
            "script": timbre_service.construct_hindi_narrative(payload.prescription_data),
            "synthesized": False,
            "format": "mp3",
            "language": "hi",
        }

    resolved_lang = normalize_language_key(voice_note_result.get("language") or requested_lang)
    lang_label = SUPPORTED_LANGUAGES.get(resolved_lang, {}).get("label", "Hindi")

    # 2. Compile standardized clinical PDF prescription document (strictly un-translated English EMR)
    pdf_filename = generate_prescription_pdf(payload.prescription_data)
    clean_pdf_name = Path(pdf_filename).name

    # Determine public server base URL and full download links
    base_url = get_server_base_url(request)
    pdf_static_url = f"/static/prescriptions/{clean_pdf_name}"
    full_pdf_url = f"{base_url}{pdf_static_url}"

    audio_static_url = voice_note_result.get("audio_url") or ""
    if audio_static_url and not audio_static_url.startswith("http"):
        full_audio_url = f"{base_url}{audio_static_url}"
    else:
        full_audio_url = audio_static_url

    # 3. Construct formatted clinical message body for WhatsApp
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

    # Append each prescribed medicine and dosage schedule
    for idx, m in enumerate(meds, start=1):
        drug_label = getattr(m, "verified_match", None) or getattr(m, "drug_name", "Medicine")
        dosage = getattr(m, "dosage", "")
        freq = getattr(m, "frequency", "")
        timing = getattr(m, "timing", "")
        duration = getattr(m, "duration", "")
        text_lines.append(f"{idx}. *{drug_label}* ({dosage})")
        text_lines.append(f"   Take: {freq} | {timing} | For {duration}")

    # Append doctor dietary and lifestyle advice if present
    advice = getattr(payload.prescription_data, "advice", None)
    if advice:
        text_lines.append(f"\n💡 *Advice:* {advice}")

    # Append vernacular voice note transcription
    script = voice_note_result.get("script", "")
    if script:
        text_lines.append(f"\n🔊 *Awaaz mein nirdesh ({lang_label}):*\n_{script}_")

    # Embed direct clickable links for Audio & PDF into WhatsApp message body
    if full_audio_url:
        text_lines.append(f"\n🎧 *Audio Voice Note (Sunein):*\n{full_audio_url}")

    if full_pdf_url:
        text_lines.append(f"\n📄 *Prescription PDF (Download):*\n{full_pdf_url}")

    text_lines.append("\n✅ *Dawai samay par lein. Shubhkaamnayein!*")

    full_text_message = "\n".join(text_lines)

    # 4. Clean phone number and generate wa.me universal deep link
    clean_phone = "".join(filter(str.isdigit, payload.phone_number))
    encoded_text = urllib.parse.quote(full_text_message)
    wa_deep_link = f"https://wa.me/{clean_phone}?text={encoded_text}"

    # 5. Persist Consultation Record in SQLite (Append-Only History)
    try:
        await history_repo.save_record({
            "patient_name": patient_name,
            "phone_number": clean_phone,
            "diagnosis": diagnosis,
            "medications_count": len(meds),
            "audio_url": full_audio_url,
            "pdf_url": full_pdf_url,
            "language": resolved_lang,
            "full_payload_json": payload.prescription_data.model_dump()
        })
    except Exception as exc:
        logger.error(f"Failed to record consultation to history repository: {exc}", exc_info=True)

    # Return dispatch details including links to audio, PDF, language, and WhatsApp
    return {
        "status": "success",
        "recipient": clean_phone,
        "language": resolved_lang,
        "whatsapp_deep_link": wa_deep_link,
        "voice_note": {
            "audio_url": full_audio_url,
            "script": voice_note_result.get("script"),
            "language": resolved_lang,
            "synthesized": voice_note_result.get("synthesized", False),
            "format": voice_note_result.get("format", "mp3")
        },
        "pdf_receipt": {
            "file_name": clean_pdf_name,
            "url": full_pdf_url,
            "status": "generated"
        }
    }

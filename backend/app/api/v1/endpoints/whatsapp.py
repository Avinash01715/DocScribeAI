# backend/app/api/v1/endpoints/whatsapp.py
import os
import uuid
from pathlib import Path
from typing import Optional
import urllib.parse
import logging
from fastapi import APIRouter, Request, BackgroundTasks
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
    try:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.base_url.netloc
        proto = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
        return f"{proto}://{host}"
    except Exception:
        return "http://localhost:8000"


async def process_heavy_dispatch_job(
    consultation_id: str,
    payload: WhatsAppSendRequest,
    request: Request,
    record_id: Optional[int] = None,
):
    """
    Background worker:
    1. Synthesizes vernacular dosage instructions via Gnani Timbre TTS (MP3).
    2. Compiles standardized PDF prescription via FPDF2.
    3. Updates SQLite consultation record from 'QUEUED' to 'COMPLETED'.
    """
    try:
        base_url = get_server_base_url(request) if isinstance(request, Request) else str(request or "http://localhost:8000")
        requested_lang = normalize_language_key(payload.language)

        logger.info(f"[{consultation_id}] Background dispatch task started for {payload.phone_number} ({requested_lang})")

        # 1. Synthesize regional audio note defensively (never aborts PDF generation)
        try:
            voice_note_result = await timbre_service.generate_voice_note(
                payload.prescription_data,
                language=requested_lang,
            )
        except Exception as exc:
            logger.warning(f"[{consultation_id}] Vernacular TTS synthesis failed for '{requested_lang}': {exc}")
            voice_note_result = {
                "audio_url": None,
                "script": timbre_service.construct_hindi_narrative(payload.prescription_data),
                "synthesized": False,
                "format": "mp3",
                "language": "hi",
            }

        resolved_lang = normalize_language_key(voice_note_result.get("language") or requested_lang)

        # 2. Compile standardized clinical PDF prescription document (FPDF2)
        pdf_filename = generate_prescription_pdf(payload.prescription_data)
        clean_pdf_name = Path(pdf_filename).name

        pdf_static_url = f"/static/prescriptions/{clean_pdf_name}"
        full_pdf_url = f"{base_url}{pdf_static_url}"

        audio_static_url = voice_note_result.get("audio_url") or ""
        if audio_static_url and not audio_static_url.startswith("http"):
            full_audio_url = f"{base_url}{audio_static_url}"
        else:
            full_audio_url = audio_static_url

        # 3. Update Consultation Record in SQLite from QUEUED to COMPLETED
        if record_id:
            await history_repo.update_record(record_id, {
                "audio_url": full_audio_url,
                "pdf_url": full_pdf_url,
                "language": resolved_lang,
                "status": "COMPLETED",
            })
            logger.info(f"[{consultation_id}] Background dispatch job finished successfully for record #{record_id}")
        else:
            p_info = payload.prescription_data.patient_info
            meds = payload.prescription_data.prescription
            clinical_findings = payload.prescription_data.clinical_findings
            patient_name = getattr(p_info, "name", "Patient")
            diagnosis = getattr(clinical_findings, "diagnosis", "Clinical Assessment")
            clean_phone = "".join(filter(str.isdigit, payload.phone_number))
            await history_repo.save_record({
                "patient_name": patient_name,
                "phone_number": clean_phone,
                "diagnosis": diagnosis,
                "medications_count": len(meds),
                "audio_url": full_audio_url,
                "pdf_url": full_pdf_url,
                "language": resolved_lang,
                "status": "COMPLETED",
                "full_payload_json": payload.prescription_data.model_dump()
            })
    except Exception as exc:
        logger.error(f"[{consultation_id}] Background dispatch job failed: {exc}", exc_info=True)
        if record_id:
            try:
                await history_repo.update_record(record_id, {"status": "FAILED"})
            except Exception:
                pass


# Endpoint to asynchronously queue voice note, PDF, and dispatch
@router.post("/dispatch", summary="Dispatch prescription text, PDF, and vernacular audio to WhatsApp")
async def dispatch_prescription(
    payload: WhatsAppSendRequest,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """
    Decoupled Asynchronous Dispatch Pipeline:
    1. Instantly creates a consultation tracking ID and records 'QUEUED' status in SQLite.
    2. Enqueues heavy TTS voice synthesis and PDF generation to FastAPI.BackgroundTasks.
    3. Unblocks the doctor immediately (<30ms) with tracking confirmation.
    """
    consultation_id = str(uuid.uuid4())
    requested_lang = normalize_language_key(payload.language)

    # Extract summary fields for instant DB queue record
    p_info = payload.prescription_data.patient_info
    meds = payload.prescription_data.prescription
    clinical_findings = payload.prescription_data.clinical_findings

    patient_name = getattr(p_info, "name", "Patient")
    diagnosis = getattr(clinical_findings, "diagnosis", "Clinical Assessment")
    clean_phone = "".join(filter(str.isdigit, payload.phone_number))

    # Record immediately with QUEUED status in SQLite
    record_id = None
    try:
        record_id = await history_repo.save_record({
            "patient_name": patient_name,
            "phone_number": clean_phone,
            "diagnosis": diagnosis,
            "medications_count": len(meds),
            "audio_url": None,
            "pdf_url": None,
            "language": requested_lang,
            "status": "QUEUED",
            "full_payload_json": payload.prescription_data.model_dump()
        })
    except Exception as exc:
        logger.error(f"[{consultation_id}] Failed to insert initial QUEUED record: {exc}", exc_info=True)

    # Heavy TTS generation aur PDF compilation background me delegate ho gaya
    background_tasks.add_task(
        process_heavy_dispatch_job,
        consultation_id,
        payload,
        request,
        record_id,
    )

    # Doctor gets immediate unblock in <30ms
    return {
        "status": "queued",
        "tracking_id": consultation_id,
        "record_id": record_id,
        "recipient": clean_phone,
        "message": "Prescription queued for generation & dispatch"
    }

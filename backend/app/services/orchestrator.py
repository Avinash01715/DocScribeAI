# backend/app/services/orchestrator.py
"""
Consultation Orchestrator Service.
Coordinates concurrent PDF generation and vernacular MP3 voice note synthesis,
assembles patient consultation artifacts, and constructs WhatsApp deep links.
"""
import os
import asyncio
import logging
import re
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.schemas.consultation import (
    ConsultationCompleteRequest,
    ConsultationCompleteResponse,
)
from app.utils.pdf_generator import generate_prescription_pdf
from app.services.gnani.timbre_service import (
    SUPPORTED_LANGUAGES,
    normalize_language_key,
    resolve_tts_language,
    synthesize_timbre_audio,
    timbre_service,
)
from app.services.gnani.evon_service import evon_service

# Initialize service logger
logger = logging.getLogger("docscribe.orchestrator")

# Server base URL for building absolute resource links
SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "http://127.0.0.1:8000")


# Normalize input phone numbers into 12-digit Indian format (91XXXXXXXXXX)
def normalize_indian_phone(phone: str) -> str:
    """Normalizes phone numbers to Indian E.164 without '+' for wa.me links."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return digits
    return digits


# Build structured Hindi/English summary text for WhatsApp messaging
def build_whatsapp_narrative(request: ConsultationCompleteRequest) -> str:
    """Creates a structured text summary optimized for WhatsApp rendering."""
    p_name = request.patient_info.name
    diag = request.clinical_findings.diagnosis

    lines = [
        f"*Namaste {p_name} ji,*",
        f"Aapka clinic consultation summary taiyyar hai.",
        f"",
        f"*Diagnosis:* {diag}",
        f"",
        f"*Dawaiyan (Medicines):*",
    ]

    for idx, med in enumerate(request.prescription, 1):
        lines.append(f"{idx}. *{med.drug_name}* - {med.dosage}")
        lines.append(f"   Khurak: {med.frequency} | {med.timing} | {med.duration}")

    if request.advice:
        lines.append(f"")
        lines.append(f"*Salah (Advice):* {request.advice}")

    return "\n".join(lines)


# Orchestrates end-to-end consultation workflow: PDF, TTS, and WhatsApp deep links
class ConsultationOrchestrator:
    # Initialize service with base application URL
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or SERVER_BASE_URL).rstrip("/")

    # Concurrently generate PDF prescription and vernacular audio note, then assemble WhatsApp response
    async def complete_consultation(
        self, request: ConsultationCompleteRequest
    ) -> ConsultationCompleteResponse:
        """
        Orchestrates parallel PDF synthesis and vernacular TTS note generation,
        aggregates generated artifacts, and constructs the WhatsApp link.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sanitized_name = re.sub(r"[^\w]", "_", request.patient_info.name)
        lang_key = normalize_language_key(request.language)

        # 1. Prepare parallel coroutines
        # FPDF2 execution is CPU-bound file I/O; receives strictly un-translated English clinical entities
        pdf_task = asyncio.to_thread(
            generate_prescription_pdf,
            patient_info=request.patient_info.model_dump(),
            clinical_findings=request.clinical_findings.model_dump(),
            prescription=[m.model_dump() for m in request.prescription],
            advice=request.advice,
            filename_suffix=f"{sanitized_name}_{timestamp}",
        )

        # Non-blocking async Timbre TTS & in-memory MP3 transcoding task
        tts_task = self._safe_synthesize_audio(request, sanitized_name, timestamp, lang_key)

        # 2. Execute concurrently to minimize round-trip tail latency
        pdf_filename, audio_filename = await asyncio.gather(pdf_task, tts_task)

        # 3. Construct public URLs for static assets
        pdf_url = f"{self.base_url}/static/prescriptions/{pdf_filename}"
        audio_url = (
            f"{self.base_url}/static/audio/{audio_filename}"
            if audio_filename
            else None
        )

        # 4. Construct WhatsApp Message & Deep Link
        message_body = build_whatsapp_narrative(request)
        message_body += f"\n\n*Digital Prescription PDF:*\n{pdf_url}"
        if audio_url:
            message_body += f"\n\n*Awaaz Mein Suniye (Audio Note - MP3):*\n{audio_url}"

        encoded_text = urllib.parse.quote(message_body)
        phone_normalized = normalize_indian_phone(request.phone_number)
        wa_deep_link = f"https://wa.me/{phone_normalized}?text={encoded_text}"

        return ConsultationCompleteResponse(
            status="success",
            patient_name=request.patient_info.name,
            pdf_url=pdf_url,
            audio_url=audio_url,
            whatsapp_deep_link=wa_deep_link,
            narrative_text=message_body,
            language=lang_key,
        )

    # Safely synthesize vernacular MP3 voice note with error fallback
    async def _safe_synthesize_audio(
        self,
        request: ConsultationCompleteRequest,
        sanitized_name: str,
        timestamp: str,
        lang_key: str = "hi",
    ) -> Optional[str]:
        """Synthesizes vernacular voice notes defensively as MP3 without breaking the pipeline."""
        target_filename = f"rx_audio_{sanitized_name}_{timestamp}.mp3"
        gnani_code, default_voice = resolve_tts_language(lang_key)
        lang_label = SUPPORTED_LANGUAGES[lang_key]["label"]

        try:
            english_script = timbre_service.construct_english_narrative(request)
            if lang_key == "en":
                spoken_script = english_script
            else:
                translated = await evon_service.translate_patient_instructions(
                    instructions_text=english_script,
                    target_language_label=lang_label,
                    target_language_code=gnani_code,
                )
                if lang_key == "hi" and translated == english_script:
                    spoken_script = timbre_service.construct_hindi_narrative(request)
                else:
                    spoken_script = translated

            result = await synthesize_timbre_audio(
                text=spoken_script,
                language=gnani_code,
                output_filename=target_filename,
                voice=default_voice,
            )
            return result.get("file_name")

        except Exception as exc:
            logger.warning(
                f"Regional TTS synthesis failed for '{gnani_code}' ({exc}). Falling back to 'hi-IN'."
            )
            try:
                fallback_script = timbre_service.construct_hindi_narrative(request)
                fallback_res = await synthesize_timbre_audio(
                    text=fallback_script,
                    language="hi-IN",
                    output_filename=target_filename,
                    voice=SUPPORTED_LANGUAGES["hi"]["default_voice"],
                )
                return fallback_res.get("file_name")
            except Exception as inner_exc:
                logger.error(f"Hindi fallback TTS synthesis also failed: {inner_exc}")
                return None


# Global consultation orchestrator singleton
orchestrator = ConsultationOrchestrator()

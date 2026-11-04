# backend/app/services/gnani/timbre_service.py
import os
import uuid
import logging
from pathlib import Path
from typing import Dict, Any
import httpx

# Decoupled schema contract import from the centralized schema layer
from app.schemas.prescription import PrescriptionExtractionResponse

logger = logging.getLogger("dhanvantari.timbre")

GNANI_TIMBRE_URL = os.getenv("GNANI_TIMBRE_URL", "https://api.gnani.ai/v1/tts")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

# Directory resolution anchored up 3 levels to backend/app/data/audio_cache
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

class TimbreTTSService:
    def __init__(self):
        self.api_url = GNANI_TIMBRE_URL
        self.api_key = GNANI_API_KEY

    def construct_hindi_narrative(self, data: PrescriptionExtractionResponse) -> str:
        """
        Transforms validated clinical entities into fluent, regional Hindi 
        dosage instructions calibrated for outpatient OPD consultations.
        """
        patient_name = data.patient_info.name if data.patient_info.name != "Unknown" else "Aap"
        phrases = [f"{patient_name} ji,"]

        for med in data.prescription:
            # Normalize OPD matrix notation into spoken regional Hindi
            freq_hindi = "din mein ek baar"
            if med.frequency == "1 - 1 - 1":
                freq_hindi = "din mein teen baar"
            elif med.frequency == "1 - 0 - 1":
                freq_hindi = "subah aur shaam"

            timing_hindi = (
                "khana khane ke baad" 
                if "after" in med.timing.lower() 
                else "khana khane se pehle"
            )
            
            drug_name = med.verified_match or med.drug_name
            phrase = f"{drug_name} {freq_hindi} {timing_hindi} lein {med.duration} tak."
            phrases.append(phrase)

        if data.advice:
            phrases.append(f"{data.advice}.")

        return " ".join(phrases)

    async def generate_voice_note(
        self, 
        data: PrescriptionExtractionResponse, 
        language: str = "hi-IN"
    ) -> Dict[str, Any]:
        """
        Synthesizes vernacular audio instructions via Gnani Timbre TTS.
        Falls back to a standard RIFF WAV buffer for offline testing without API credentials.
        """
        hindi_script = self.construct_hindi_narrative(data)
        file_id = f"rx_{uuid.uuid4().hex[:8]}.wav"
        output_filepath = AUDIO_CACHE_DIR / file_id

        # Deterministic offline mock fallback
        if not self.api_key:
            logger.info("GNANI_API_KEY not set. Generating mock WAV header buffer.")
            self._generate_silent_mock_wav(output_filepath)
            return {
                "file_name": file_id,
                "audio_url": f"/static/audio/{file_id}",
                "local_path": str(output_filepath),
                "script": hindi_script,
                "synthesized": False
            }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "text": hindi_script,
            "language": language,
            "audio_format": "wav",
            "voice_gender": "female",
            "prosody": {"rate": "0.95", "pitch": "1.0"}
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(self.api_url, headers=headers, json=payload)
                response.raise_for_status()
                with open(output_filepath, "wb") as f:
                    f.write(response.content)

            return {
                "file_name": file_id,
                "audio_url": f"/static/audio/{file_id}",
                "local_path": str(output_filepath),
                "script": hindi_script,
                "synthesized": True
            }
        except Exception as exc:
            logger.error(f"Timbre TTS synthesis failed: {exc}. Using fallback WAV buffer.")
            self._generate_silent_mock_wav(output_filepath)
            return {
                "file_name": file_id,
                "audio_url": f"/static/audio/{file_id}",
                "local_path": str(output_filepath),
                "script": hindi_script,
                "synthesized": False
            }

    def _generate_silent_mock_wav(self, path: Path) -> None:
        """Generates a minimal 44-byte standard RIFF WAV header for audio player compatibility."""
        if not path.exists():
            with open(path, "wb") as f:
                f.write(
                    b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00'
                    b'D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'
                )

timbre_service = TimbreTTSService()
# backend/app/services/gnani/timbre_service.py
import os
from dotenv import load_dotenv
load_dotenv()
import uuid
import wave
import logging
from pathlib import Path
from typing import Dict, Any
import httpx

# Decoupled schema contract import from the centralized schema layer
from app.schemas.prescription import PrescriptionExtractionResponse

logger = logging.getLogger("dhanvantari.timbre")

GNANI_TIMBRE_URL = os.getenv("GNANI_TIMBRE_URL", "https://api.vachana.ai/api/v1/tts/inference")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

# Directory resolution anchored to backend/app for consistency with FastAPI static mount
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
        Packages raw Linear PCM into a standard, playable RIFF WAV file for browsers.
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
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json"
        }
        # Supported voices for timbre-v3.0 from Gnani platform:
        # Avinash (checked in screenshot), Lakshmi, Shivani, Kalpana, Shubham, Prakash, Devansh
        voice_candidates = ["Avinash", "Lakshmi", "Shivani", "Kalpana", "Shubham", "Prakash", "Devansh"]
        for voice in voice_candidates:
            payload = {
                "text": hindi_script,
                "language": language,
                "voice": voice,
                "model": "timbre-v3.0"
            }
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(self.api_url, headers=headers, json=payload)
                
                # If API returns JSON (error message), treat as failure to try next voice
                if "application/json" in response.headers.get("Content-Type", "").lower():
                    raise Exception(f"Timbre API returned JSON: {response.text[:200]}")
                
                response.raise_for_status()
                content = response.content
                # Guard against empty or too‑small payloads (unlikely to be valid audio)
                if not content or len(content) < 1024:
                    raise Exception("Timbre API returned empty or insufficient audio data")

                # Gnani returns raw 24kHz 16-bit mono PCM bytes: package into standard RIFF WAV
                if content.startswith(b"RIFF"):
                    with open(output_filepath, "wb") as f:
                        f.write(content)
                else:
                    with wave.open(str(output_filepath), "wb") as wf:
                        wf.setnchannels(1)      # 1 channel (mono)
                        wf.setsampwidth(2)      # 16-bit PCM = 2 bytes per sample
                        wf.setframerate(24000)  # 24 kHz
                        wf.writeframes(content)

                logger.info(f"Successfully synthesized voice note with voice '{voice}' using timbre-v3.0 ({len(content)} bytes)")
                return {
                    "file_name": file_id,
                    "audio_url": f"/static/audio/{file_id}",
                    "local_path": str(output_filepath),
                    "script": hindi_script,
                    "synthesized": True,
                    "voice_used": voice
                }
            except Exception as exc:
                logger.error(f"Timbre TTS synthesis with voice '{voice}' failed: {exc}")
                # If this was the last candidate, fallback to silent WAV
                if voice == voice_candidates[-1]:
                    self._generate_silent_mock_wav(output_filepath)
                    return {
                        "file_name": file_id,
                        "audio_url": f"/static/audio/{file_id}",
                        "local_path": str(output_filepath),
                        "script": hindi_script,
                        "synthesized": False,
                        "voice_used": voice
                    }

    def _generate_silent_mock_wav(self, path: Path) -> None:
        """Generates a minimal silent WAV buffer for audio player compatibility."""
        if not path.exists():
            with wave.open(str(path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(b"\x00" * 4800)  # 0.1s of silence at 24kHz

timbre_service = TimbreTTSService()

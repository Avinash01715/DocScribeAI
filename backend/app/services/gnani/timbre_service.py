# backend/app/services/gnani/timbre_service.py
import os
import re
import uuid
import wave
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import httpx

load_dotenv()

logger = logging.getLogger("dhanvantari.timbre")

GNANI_TIMBRE_URL = os.getenv("GNANI_TIMBRE_URL", "https://api.vachana.ai/api/v1/tts/inference")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

# Directory resolution anchored directly to backend/app/data/audio_cache
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Standard clinical tele-health audio sampling clock (16 kHz, 16-bit Mono Linear PCM)
DEFAULT_SAMPLE_RATE = 16000


class TimbreTTSService:
    def __init__(self):
        self.api_url = GNANI_TIMBRE_URL
        self.api_key = GNANI_API_KEY

    def construct_hindi_narrative(self, data: Any) -> str:
        """
        Transforms clinical entities into spoken regional Hindi dosage instructions.
        Accepts Pydantic schemas or standard dictionary payloads.
        """
        # Resolve patient name
        p_info = getattr(data, "patient_info", None) or (data.get("patient_info") if isinstance(data, dict) else None)
        if p_info:
            p_name = getattr(p_info, "name", None) or (p_info.get("name") if isinstance(p_info, dict) else "Aap")
        else:
            p_name = "Aap"

        patient_name = p_name if p_name and p_name != "Unknown" else "Aap"
        phrases = [f"{patient_name} ji,"]

        # Resolve prescription list
        prescription = getattr(data, "prescription", None) or (data.get("prescription") if isinstance(data, dict) else [])
        for med in prescription:
            freq = getattr(med, "frequency", None) or (med.get("frequency") if isinstance(med, dict) else "")
            timing = getattr(med, "timing", None) or (med.get("timing") if isinstance(med, dict) else "")
            duration = getattr(med, "duration", None) or (med.get("duration") if isinstance(med, dict) else "")
            drug_name = (
                getattr(med, "verified_match", None)
                or getattr(med, "drug_name", None)
                or (med.get("verified_match") if isinstance(med, dict) else None)
                or (med.get("drug_name") if isinstance(med, dict) else "Dawai")
            )

            # Map matrix notation to natural spoken clinical Hindi
            freq_hindi = "din mein ek baar"
            if freq == "1 - 1 - 1":
                freq_hindi = "din mein teen baar"
            elif freq == "1 - 0 - 1":
                freq_hindi = "subah aur shaam"

            timing_hindi = (
                "khana khane ke baad"
                if "after" in str(timing).lower()
                else "khana khane se pehle"
            )

            phrase = f"{drug_name} {freq_hindi} {timing_hindi} lein {duration} tak."
            phrases.append(phrase)

        advice = getattr(data, "advice", None) or (data.get("advice") if isinstance(data, dict) else "")
        if advice:
            phrases.append(f"{advice}.")

        return " ".join(phrases)

    async def synthesize_text(
        self,
        text: str,
        language: str = "hi-IN",
        output_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synthesizes text via Gnani Timbre TTS and packages the resulting stream
        into an accurate, browser-compatible RIFF WAV file.
        """
        file_id = output_filename if output_filename else f"rx_{uuid.uuid4().hex[:8]}.wav"
        output_filepath = AUDIO_CACHE_DIR / file_id

        # Deterministic offline mock fallback
        if not self.api_key:
            logger.info("GNANI_API_KEY not set. Generating 16kHz calibrated mock WAV buffer.")
            self._generate_silent_mock_wav(output_filepath, sample_rate=DEFAULT_SAMPLE_RATE)
            return {
                "file_name": file_id,
                "audio_url": f"/static/audio/{file_id}",
                "local_path": str(output_filepath),
                "script": text,
                "synthesized": False
            }

        headers = {
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json"
        }

        voice_candidates = ["Avinash", "Lakshmi", "Shivani", "Kalpana", "Shubham", "Prakash", "Devansh"]
        for voice in voice_candidates:
            payload = {
                "text": text,
                "language": language,
                "voice": voice,
                "model": "timbre-v3.0"
            }
            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(self.api_url, headers=headers, json=payload)

                # Catch JSON error responses
                if "application/json" in response.headers.get("Content-Type", "").lower():
                    raise Exception(f"Timbre API returned JSON error: {response.text[:200]}")

                response.raise_for_status()
                content = response.content

                if not content or len(content) < 1024:
                    raise Exception("Timbre API returned empty or truncated audio buffer")

                # Detect sample rate from response headers if available, else calibrate to 16000 Hz
                detected_rate = DEFAULT_SAMPLE_RATE
                rate_header = response.headers.get("x-audio-sample-rate")
                if rate_header and rate_header.isdigit():
                    detected_rate = int(rate_header)

                # Write directly if already a RIFF WAV container, otherwise package raw Linear PCM
                if content.startswith(b"RIFF"):
                    with open(output_filepath, "wb") as f:
                        f.write(content)
                else:
                    with wave.open(str(output_filepath), "wb") as wf:
                        wf.setnchannels(1)             # 1 Channel (Mono)
                        wf.setsampwidth(2)             # 16-bit PCM = 2 bytes per sample
                        wf.setframerate(detected_rate) # Calibrated sampling frequency (16000 Hz)
                        wf.writeframes(content)

                logger.info(
                    f"Synthesized voice note successfully (Voice: '{voice}', SampleRate: {detected_rate}Hz, Bytes: {len(content)})"
                )
                return {
                    "file_name": file_id,
                    "audio_url": f"/static/audio/{file_id}",
                    "local_path": str(output_filepath),
                    "script": text,
                    "synthesized": True,
                    "voice_used": voice
                }
            except Exception as exc:
                logger.error(f"Timbre TTS synthesis with voice '{voice}' failed: {exc}")
                if voice == voice_candidates[-1]:
                    # Final fallback to calibrated silent buffer
                    self._generate_silent_mock_wav(output_filepath, sample_rate=DEFAULT_SAMPLE_RATE)
                    return {
                        "file_name": file_id,
                        "audio_url": f"/static/audio/{file_id}",
                        "local_path": str(output_filepath),
                        "script": text,
                        "synthesized": False,
                        "voice_used": voice
                    }

    async def generate_voice_note(
        self,
        data: Any,
        language: str = "hi-IN"
    ) -> Dict[str, Any]:
        """Backwards-compatible interface for structured consultation models."""
        hindi_script = self.construct_hindi_narrative(data)
        return await self.synthesize_text(text=hindi_script, language=language)

    def _generate_silent_mock_wav(self, path: Path, sample_rate: int = DEFAULT_SAMPLE_RATE) -> None:
        """
        Generates 1.0 second of clean silence calibrated at the target sample rate.
        16000 samples/sec * 2 bytes/sample * 1 second = 32000 bytes.
        """
        if not path.exists():
            with wave.open(str(path), "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sample_rate)
                wf.writeframes(b"\x00" * (sample_rate * 2))


# Service instance singleton
timbre_service = TimbreTTSService()


# Asynchronous functional adapter for ConsultationOrchestrator
async def synthesize_timbre_audio(
    text: str,
    language: str = "hi-IN",
    output_filename: Optional[str] = None
) -> Dict[str, Any]:
    """
    Adapter function invoked directly by app/services/orchestrator.py.
    """
    return await timbre_service.synthesize_text(
        text=text,
        language=language,
        output_filename=output_filename
    )
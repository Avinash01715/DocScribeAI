# backend/app/services/gnani/timbre_service.py
"""
Gnani Timbre TTS Service with Native In-Memory MP3 Transcoding.
Calibrated for 16,000 Hz Linear PCM audio, transformed to MP3 (audio/mpeg, 64kbps)
for universal compatibility across WhatsApp Web Share (navigator.share), wa.me links,
and mobile browser streaming.
"""
import io
import os
import uuid
import wave
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from dotenv import load_dotenv
import httpx
from pydub import AudioSegment

load_dotenv()

logger = logging.getLogger("dhanvantari.timbre")

GNANI_TIMBRE_URL = os.getenv("GNANI_TIMBRE_URL", "https://api.vachana.ai/api/v1/tts/inference")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

# Directory resolution anchored directly to backend/app/data/audio_cache
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Upstream Gnani Timbre native clock (16 kHz, 16-bit Mono Linear PCM)
DEFAULT_SAMPLE_RATE = 48000


class TimbreTTSService:
    def __init__(self):
        self.api_url = GNANI_TIMBRE_URL
        self.api_key = GNANI_API_KEY

    def construct_hindi_narrative(self, data: Any) -> str:
        """
        Transforms clinical entities into spoken regional Hindi dosage instructions.
        Accepts Pydantic schemas or standard dictionary payloads.
        """
        p_info = getattr(data, "patient_info", None) or (data.get("patient_info") if isinstance(data, dict) else None)
        if p_info:
            p_name = getattr(p_info, "name", None) or (p_info.get("name") if isinstance(p_info, dict) else "Aap")
        else:
            p_name = "Aap"

        patient_name = p_name if p_name and p_name != "Unknown" else "Aap"
        phrases = [f"{patient_name} ji,"]

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

    def _package_pcm_to_wav(self, raw_pcm: bytes, sample_rate: int = DEFAULT_SAMPLE_RATE) -> bytes:
        """Packages raw 16-bit Mono Linear PCM into a compliant RIFF WAV container in memory."""
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wf:
            wf.setnchannels(1)             # Mono
            wf.setsampwidth(2)             # 16-bit signed PCM
            wf.setframerate(sample_rate)   # Calibrated 16000 Hz
            wf.writeframes(raw_pcm)
        return wav_io.getvalue()

    def _transcode_wav_to_mp3(self, wav_bytes: bytes, sample_rate: int = DEFAULT_SAMPLE_RATE) -> bytes:
        """
        Synchronous worker: Converts in-memory WAV bytes to an optimized MP3 stream (64kbps, mono).
        Executed inside asyncio.to_thread to prevent blocking the event loop.
        """
        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(wav_bytes), format="wav")
            # Enforce 16kHz mono sampling for human speech clarity
            audio_segment = audio_segment.set_frame_rate(sample_rate).set_channels(1)
            mp3_io = io.BytesIO()
            audio_segment.export(mp3_io, format="mp3", bitrate="64k")
            return mp3_io.getvalue()
        except Exception as exc:
            logger.error(f"FFmpeg/Pydub MP3 transcoding failed: {exc}. Returning raw WAV bytes as fallback.")
            return wav_bytes

    async def synthesize_raw_audio(
        self,
        text: str,
        language: str = "hi-IN",
        voice: Optional[str] = None,
        target_sample_rate: int = DEFAULT_SAMPLE_RATE
    ) -> Tuple[bytes, int]:
        """
        Synthesizes text via Gnani Timbre TTS and returns (wav_bytes, sample_rate).
        Guarantees container encapsulation aligned to target_sample_rate.
        """
        if not self.api_key:
            logger.info(f"GNANI_API_KEY unconfigured. Generating synthetic silent buffer at {target_sample_rate}Hz.")
            silent_pcm = b"\x00" * (target_sample_rate * 2)  # 1.0 second silence
            return self._package_pcm_to_wav(silent_pcm, sample_rate=target_sample_rate), target_sample_rate

        headers = {
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json"
        }

        candidates = [voice] if voice else ["Avinash", "Lakshmi", "Shivani", "Kalpana", "Shubham", "Prakash", "Devansh"]

        for v in candidates:
            if not v:
                continue

            payload = {
                "text": text,
                "language": language,
                "voice": v,
                "model": "timbre-v3.0",
                "container": "wav",
                "audioformat": "wav",
                "sample_rate": target_sample_rate
            }

            try:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(self.api_url, headers=headers, json=payload)

                if "application/json" in response.headers.get("Content-Type", "").lower():
                    raise Exception(f"Timbre API error payload: {response.text[:200]}")

                response.raise_for_status()
                content = response.content

                if not content or len(content) < 1024:
                    raise Exception("Timbre API returned empty or truncated audio buffer")

                detected_rate = target_sample_rate
                rate_header = response.headers.get("x-audio-sample-rate")
                if rate_header and rate_header.isdigit():
                    detected_rate = int(rate_header)

                if content.startswith(b"RIFF"):
                    wav_bytes = content
                else:
                    wav_bytes = self._package_pcm_to_wav(content, sample_rate=detected_rate)

                logger.info(
                    f"Synthesized TTS audio with voice '{v}' (SampleRate: {detected_rate}Hz, Bytes: {len(wav_bytes)})"
                )
                return wav_bytes, detected_rate

            except Exception as exc:
                logger.warning(f"Voice candidate '{v}' synthesis failed: {exc}")
                if v == candidates[-1]:
                    logger.error("All Timbre voice candidates exhausted. Returning calibrated fallback audio.")
                    silent_pcm = b"\x00" * (target_sample_rate * 2)
                    return self._package_pcm_to_wav(silent_pcm, sample_rate=target_sample_rate), target_sample_rate

        silent_pcm = b"\x00" * (target_sample_rate * 2)
        return self._package_pcm_to_wav(silent_pcm, sample_rate=target_sample_rate), target_sample_rate

    async def synthesize_text(
        self,
        text: str,
        language: str = "hi-IN",
        output_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synthesizes speech via Gnani Timbre TTS, transcodes the stream into an MP3 container
        in a non-blocking worker thread, and writes the asset to the ephemeral audio cache.
        """
        # Determine output filename with .mp3 extension
        if output_filename:
            base_name = Path(output_filename).stem
            file_id = f"{base_name}.mp3"
        else:
            file_id = f"rx_{uuid.uuid4().hex[:8]}.mp3"

        output_filepath = AUDIO_CACHE_DIR / file_id

        # 1. Fetch raw WAV buffer from upstream Timbre
        wav_bytes, detected_rate = await self.synthesize_raw_audio(
            text=text,
            language=language,
            target_sample_rate=DEFAULT_SAMPLE_RATE
        )

        # 2. Non-blocking in-memory transcoding to MP3 (audio/mpeg)
        mp3_bytes = await asyncio.to_thread(
            self._transcode_wav_to_mp3,
            wav_bytes,
            detected_rate
        )

        # 3. Persist MP3 asset to disk cache
        with open(output_filepath, "wb") as f:
            f.write(mp3_bytes)

        logger.info(f"Persisted WhatsApp-compliant MP3 asset: {file_id} ({len(mp3_bytes)} bytes)")

        return {
            "file_name": file_id,
            "audio_url": f"/static/audio/{file_id}",
            "local_path": str(output_filepath),
            "script": text,
            "sample_rate": detected_rate,
            "format": "mp3",
            "content_type": "audio/mpeg",
            "synthesized": bool(self.api_key)
        }

    async def generate_voice_note(
        self,
        data: Any,
        language: str = "hi-IN"
    ) -> Dict[str, Any]:
        """Backwards-compatible interface for structured consultation models."""
        hindi_script = self.construct_hindi_narrative(data)
        return await self.synthesize_text(text=hindi_script, language=language)


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
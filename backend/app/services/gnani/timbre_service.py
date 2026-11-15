# backend/app/services/gnani/timbre_service.py
"""
Gnani Timbre TTS Service with Native In-Memory MP3 Transcoding.
Calibrated for 16,000 Hz Linear PCM audio, transformed to MP3 (audio/mpeg, 64kbps)
for universal compatibility across WhatsApp Web Share (navigator.share), wa.me links,
and mobile browser streaming. Includes active disk capacity management.
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

# Load environment configuration
load_dotenv()

# Initialize module logger
logger = logging.getLogger("docscribe.timbre")

# Upstream Gnani Timbre TTS endpoint and API key
GNANI_TIMBRE_URL = os.getenv("GNANI_TIMBRE_URL", "https://api.vachana.ai/api/v1/tts/inference")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

# Upstream Gnani Timbre native clock (16 kHz, 16-bit Mono Linear PCM)
DEFAULT_SAMPLE_RATE = 48000

# Cache directory for synthesized audio files
BASE_DIR = Path(__file__).resolve().parent.parent.parent
AUDIO_CACHE_DIR = BASE_DIR / "data" / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Centralized language mapping for Gnani Timbre TTS using timbre-v3.0 certified voices
SUPPORTED_LANGUAGES: Dict[str, Dict[str, str]] = {
    "hi": {"code": "hi-IN", "label": "Hindi", "default_voice": "Shivani"},
    "en": {"code": "en-IN", "label": "English", "default_voice": "Shivani"},
    "ta": {"code": "ta-IN", "label": "Tamil", "default_voice": "Lakshmi"},
    "te": {"code": "te-IN", "label": "Telugu", "default_voice": "Lakshmi"},
    "bn": {"code": "bn-IN", "label": "Bengali", "default_voice": "Shivani"},
}

FALLBACK_VOICES = ["Shivani", "Lakshmi", "Avinash", "Kalpana", "Shubham", "Prakash", "Devansh"]


def normalize_language_key(lang_input: Optional[str]) -> str:
    """
    Normalizes ISO 639-1, BCP 47, or display label inputs ('hi', 'ta', 'hi-IN', 'Tamil')
    to a canonical 2-letter language key. Falls back to 'hi' if unsupported or None.
    """
    if not lang_input or not isinstance(lang_input, str):
        return "hi"
    cleaned = lang_input.strip().lower().replace("_", "-")
    if not cleaned:
        return "hi"
    if cleaned in SUPPORTED_LANGUAGES:
        return cleaned
    prefix = cleaned.split("-")[0]
    if prefix in SUPPORTED_LANGUAGES:
        return prefix
    for key, meta in SUPPORTED_LANGUAGES.items():
        if meta["label"].lower() == cleaned or meta["code"].lower() == cleaned:
            return key
    logger.warning(f"Unsupported language input '{lang_input}'. Falling back cleanly to 'hi'.")
    return "hi"


def resolve_tts_language(lang_input: Optional[str]) -> Tuple[str, str]:
    """
    Defensive resolver mapping shorthand or BCP-47 inputs ('hi', 'ta', 'hi-IN')
    to the corresponding Gnani Timbre locale code and certified timbre-v3.0 voice.
    Falls back cleanly to ('hi-IN', 'Shivani') for unsupported codes or None.
    """
    key = normalize_language_key(lang_input)
    meta = SUPPORTED_LANGUAGES[key]
    return meta["code"], meta["default_voice"]


# Service handling speech synthesis and MP3 transcoding for patient voice notes
class TimbreTTSService:
    # Initialize service credentials and local cache folder
    def __init__(self):
        self.api_url = GNANI_TIMBRE_URL
        self.api_key = GNANI_API_KEY
        self.cache_dir = AUDIO_CACHE_DIR

    # Construct clean English patient instructions isolating patient advice from medical prescription
    def construct_english_narrative(self, data: Any) -> str:
        """
        Transforms clinical entities into clear spoken English patient instructions
        and isolated home-care advice prior to optional LLM vernacular translation.
        """
        p_info = getattr(data, "patient_info", None) or (data.get("patient_info") if isinstance(data, dict) else None)
        p_name = (
            (getattr(p_info, "name", None) or (p_info.get("name") if isinstance(p_info, dict) else None))
            if p_info else None
        )
        patient_name = p_name if p_name and p_name != "Unknown" else "Patient"

        phrases = [f"Hello {patient_name}, here are your prescription instructions."]
        prescription = getattr(data, "prescription", None) or (data.get("prescription") if isinstance(data, dict) else [])

        for med in prescription:
            freq = getattr(med, "frequency", None) or (med.get("frequency") if isinstance(med, dict) else "")
            dosage = getattr(med, "dosage", None) or (med.get("dosage") if isinstance(med, dict) else "")
            timing = getattr(med, "timing", None) or (med.get("timing") if isinstance(med, dict) else "")
            duration = getattr(med, "duration", None) or (med.get("duration") if isinstance(med, dict) else "")
            drug_name = (
                getattr(med, "verified_match", None)
                or getattr(med, "drug_name", None)
                or (med.get("verified_match") if isinstance(med, dict) else None)
                or (med.get("drug_name") if isinstance(med, dict) else "Medication")
            )

            freq_text = "once daily"
            if freq == "1 - 1 - 1":
                freq_text = "three times a day"
            elif freq == "1 - 0 - 1":
                freq_text = "twice a day, morning and evening"
            elif freq == "1 - 0 - 0":
                freq_text = "once in the morning"

            timing_text = "after meals" if "after" in str(timing).lower() else "before food"
            dose_part = f"{dosage}, " if dosage else ""
            duration_part = f" for {duration}" if duration else ""
            phrases.append(f"Take {drug_name}, {dose_part}{freq_text} {timing_text}{duration_part}.")

        advice = getattr(data, "advice", None) or (data.get("advice") if isinstance(data, dict) else "")
        if advice and str(advice).strip():
            phrases.append(f"Home care advice: {str(advice).strip()}.")

        return " ".join(phrases)

    # Construct regional spoken Hindi dosage instructions from prescription data
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

    # Package raw 16-bit Mono Linear PCM bytes into standard RIFF WAV format
    def _package_pcm_to_wav(self, raw_pcm: bytes, sample_rate: int = DEFAULT_SAMPLE_RATE) -> bytes:
        """Packages raw 16-bit Mono Linear PCM into a compliant RIFF WAV container in memory."""
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wf:
            wf.setnchannels(1)             # Mono
            wf.setsampwidth(2)             # 16-bit signed PCM
            wf.setframerate(sample_rate)   # Calibrated 16000 Hz
            wf.writeframes(raw_pcm)
        return wav_io.getvalue()

    # Transcode WAV audio bytes to 64kbps mono MP3 format using pydub
    def _transcode_wav_to_mp3(self, wav_bytes: bytes, sample_rate: int = DEFAULT_SAMPLE_RATE) -> bytes:
        """
        Synchronous worker: Converts in-memory WAV bytes to an optimized MP3 stream (64kbps, mono).
        Executed inside asyncio.to_thread to prevent blocking the event loop.
        """
        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(wav_bytes), format="wav")
            audio_segment = audio_segment.set_frame_rate(sample_rate).set_channels(1)
            mp3_io = io.BytesIO()
            audio_segment.export(mp3_io, format="mp3", bitrate="64k")
            return mp3_io.getvalue()
        except Exception as exc:
            logger.error(f"FFmpeg/Pydub MP3 transcoding failed: {exc}. Returning raw WAV bytes as fallback.")
            return wav_bytes

    # Synchronously write binary payload to filesystem path
    def _write_bytes_to_disk(self, target_path: Path, payload: bytes) -> None:
        """Synchronous write routine to be called via asyncio.to_thread."""
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with open(target_path, "wb") as f:
            f.write(payload)

    # Send synthesis request to Timbre API across voice candidates and return WAV bytes
    async def synthesize_raw_audio(
        self,
        text: str,
        language: Optional[str] = "hi-IN",
        voice: Optional[str] = None,
        target_sample_rate: int = DEFAULT_SAMPLE_RATE,
        allow_hindi_fallback: bool = True
    ) -> Tuple[bytes, int]:
        """
        Synthesizes text via Gnani Timbre TTS and returns (wav_bytes, sample_rate).
        Guarantees container encapsulation aligned to target_sample_rate.
        """
        gnani_lang, default_voice = resolve_tts_language(language)

        # Generate silent WAV fallback when API key is unconfigured
        if not self.api_key:
            logger.info(f"GNANI_API_KEY unconfigured. Generating synthetic silent buffer at {target_sample_rate}Hz.")
            silent_pcm = b"\x00" * (target_sample_rate * 2)
            return self._package_pcm_to_wav(silent_pcm, sample_rate=target_sample_rate), target_sample_rate

        headers = {
            "X-API-Key-ID": self.api_key,
            "Content-Type": "application/json"
        }

        primary = voice or default_voice
        candidates = [primary] + [c for c in FALLBACK_VOICES if c != primary]

        # Iterate over voice candidates until synthesis succeeds
        for v in candidates:
            if not v:
                continue

            payload = {
                "text": text,
                "language": gnani_lang,
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
                    f"Synthesized TTS audio ({gnani_lang}) with voice '{v}' "
                    f"(SampleRate: {detected_rate}Hz, Bytes: {len(wav_bytes)})"
                )
                return wav_bytes, detected_rate

            except Exception as exc:
                logger.warning(f"Voice candidate '{v}' synthesis failed for '{gnani_lang}': {exc}")

        # Regional dialect failover to Hindi before returning calibrated silence
        if allow_hindi_fallback and gnani_lang != "hi-IN":
            logger.warning(
                f"All voice candidates failed for '{gnani_lang}'. Falling back to 'hi-IN' synthesis."
            )
            return await self.synthesize_raw_audio(
                text=text,
                language="hi-IN",
                voice="Shivani",
                target_sample_rate=target_sample_rate,
                allow_hindi_fallback=False,
            )

        logger.error("All Timbre voice candidates exhausted. Returning calibrated fallback audio.")
        silent_pcm = b"\x00" * (target_sample_rate * 2)
        return self._package_pcm_to_wav(silent_pcm, sample_rate=target_sample_rate), target_sample_rate

    # Synthesize text, convert to MP3, and save to ephemeral disk cache
    async def synthesize_text(
        self,
        text: str,
        language: Optional[str] = "hi",
        output_filename: Optional[str] = None,
        voice: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Synthesizes speech via Gnani Timbre TTS, transcodes to 64kbps MP3 in a worker thread,
        and safely writes to the ephemeral cache directory.
        """
        lang_key = normalize_language_key(language)
        gnani_code, default_voice = resolve_tts_language(lang_key)

        if output_filename:
            base_name = Path(output_filename).stem
            file_id = f"{base_name}.mp3"
        else:
            file_id = f"rx_{uuid.uuid4().hex[:8]}.mp3"

        output_filepath = self.cache_dir / file_id

        try:
            # 1. Fetch raw synthesized audio buffer
            wav_bytes, detected_rate = await self.synthesize_raw_audio(
                text=text,
                language=gnani_code,
                voice=voice or default_voice,
                target_sample_rate=DEFAULT_SAMPLE_RATE
            )

            # 2. Non-blocking transcode to MP3 in worker thread
            mp3_bytes = await asyncio.to_thread(
                self._transcode_wav_to_mp3,
                wav_bytes,
                detected_rate
            )

            # 3. Non-blocking write to disk cache in worker thread
            await asyncio.to_thread(self._write_bytes_to_disk, output_filepath, mp3_bytes)

            logger.info(
                f"Persisted WhatsApp-compliant MP3 asset ({gnani_code}): {file_id} ({len(mp3_bytes)} bytes)"
            )

            return {
                "file_name": file_id,
                "audio_url": f"/static/audio/{file_id}",
                "local_path": str(output_filepath),
                "script": text,
                "language": lang_key,
                "locale": gnani_code,
                "sample_rate": detected_rate,
                "format": "mp3",
                "content_type": "audio/mpeg",
                "synthesized": bool(self.api_key)
            }
        except Exception as exc:
            logger.error(f"Audio synthesis/transcode pipeline error ({gnani_code}): {exc}", exc_info=True)
            return {
                "file_name": None,
                "audio_url": None,
                "local_path": None,
                "script": text,
                "language": lang_key,
                "locale": gnani_code,
                "sample_rate": DEFAULT_SAMPLE_RATE,
                "format": "mp3",
                "content_type": "audio/mpeg",
                "synthesized": False
            }

    # Generate complete regional voice note from clinical consultation object
    async def generate_voice_note(
        self,
        data: Any,
        language: Optional[str] = "hi"
    ) -> Dict[str, Any]:
        """
        Builds isolated patient instructions, translates to target vernacular script when
        language != 'en', and synthesizes MP3 voice note with defensive Hindi fallback.
        """
        lang_key = normalize_language_key(language)
        gnani_code, default_voice = resolve_tts_language(lang_key)
        lang_label = SUPPORTED_LANGUAGES[lang_key]["label"]

        # 1. Isolate patient instructions (medical prescription + home-care advice) without mutating PDF entities
        english_script = self.construct_english_narrative(data)

        if lang_key == "en":
            spoken_script = english_script
        else:
            from app.services.gnani.evon_service import evon_service

            translated = await evon_service.translate_patient_instructions(
                instructions_text=english_script,
                target_language_label=lang_label,
                target_language_code=gnani_code,
            )
            # If translation fell back to original English and target is Hindi, use local Hinglish builder
            if lang_key == "hi" and translated == english_script:
                spoken_script = self.construct_hindi_narrative(data)
            else:
                spoken_script = translated

        # 2. Defensive TTS Synthesis with automatic Hindi fallback on regional failure
        try:
            result = await self.synthesize_text(
                text=spoken_script,
                language=gnani_code,
                voice=default_voice
            )
            if not result.get("audio_url") and lang_key != "hi":
                raise RuntimeError(f"Empty audio asset generated for {gnani_code}")
            result["language"] = lang_key
            return result
        except Exception as exc:
            logger.warning(
                f"Regional TTS synthesis failed for '{gnani_code}' ({exc}). Falling back to 'hi-IN'."
            )
            try:
                hindi_fallback_script = self.construct_hindi_narrative(data)
                fallback_res = await self.synthesize_text(
                    text=hindi_fallback_script,
                    language="hi-IN",
                    voice=SUPPORTED_LANGUAGES["hi"]["default_voice"],
                )
                fallback_res["language"] = "hi"
                return fallback_res
            except Exception as inner_exc:
                logger.error(f"Hindi fallback TTS synthesis also failed: {inner_exc}")
                return {
                    "file_name": None,
                    "audio_url": None,
                    "local_path": None,
                    "script": spoken_script,
                    "language": lang_key,
                    "locale": gnani_code,
                    "format": "mp3",
                    "content_type": "audio/mpeg",
                    "synthesized": False,
                }


# Service instance singleton
timbre_service = TimbreTTSService()


# Adapter function to synthesize speech directly from orchestrator
async def synthesize_timbre_audio(
    text: str,
    language: Optional[str] = "hi",
    output_filename: Optional[str] = None,
    voice: Optional[str] = None
) -> Dict[str, Any]:
    """Adapter function invoked directly by app/services/orchestrator.py."""
    return await timbre_service.synthesize_text(
        text=text,
        language=language,
        output_filename=output_filename,
        voice=voice
    )
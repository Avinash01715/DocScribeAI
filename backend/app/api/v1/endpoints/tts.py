# backend/app/api/v1/endpoints/tts.py
"""
Production-Ready TTS Proxy Route for Gnani Timbre TTS.
Resolves MIME type alignment, binary streaming, and container configuration (16000 Hz Linear PCM / WAV).
"""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.services.gnani.timbre_service import timbre_service, DEFAULT_SAMPLE_RATE

logger = logging.getLogger("dhanvantari.tts_proxy")

router = APIRouter(prefix="/tts", tags=["TTS Proxy"])


class TTSProxyRequest(BaseModel):
    text: str = Field(
        ...,
        examples=["Ramesh ji, Paracetamol din mein teen baar khana khane ke baad lein."],
        description="Spoken narrative string to synthesize"
    )
    language: str = Field(
        default="hi-IN",
        examples=["hi-IN"],
        description="Target BCP-47 language locale"
    )
    voice: Optional[str] = Field(
        default=None,
        examples=["Avinash"],
        description="Candidate voice persona for Gnani Timbre"
    )
    sample_rate: int = Field(
        default=DEFAULT_SAMPLE_RATE,
        examples=[16000],
        description="Target audio sampling rate in Hz"
    )
    container: str = Field(
        default="wav",
        examples=["wav"],
        description="Encapsulation container format"
    )


@router.post(
    "/synthesize",
    summary="Synthesize speech with linear PCM 16kHz WAV container",
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Standard RIFF WAV linear PCM audio stream at 16000 Hz."
        }
    }
)
async def proxy_synthesize_post(request: TTSProxyRequest):
    """
    Proxies TTS synthesis to Gnani Timbre TTS:
    1. Dispatches request to Timbre API with calibrated 16000 Hz sampling.
    2. Packages raw Linear PCM to standard RIFF WAV.
    3. Returns binary response with strict 'audio/wav' MIME type and cache controls.
    """
    try:
        audio_bytes, detected_rate = await timbre_service.synthesize_raw_audio(
            text=request.text,
            language=request.language,
            voice=request.voice,
            target_sample_rate=request.sample_rate
        )

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Type": "audio/wav",
                "Content-Length": str(len(audio_bytes)),
                "Content-Disposition": 'inline; filename="synthesized_speech.wav"',
                "x-audio-sample-rate": str(detected_rate),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
        )
    except Exception as exc:
        logger.error(f"TTS Proxy synthesis failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TTS Proxy Error: {str(exc)}"
        )


@router.get(
    "/synthesize",
    summary="GET endpoint for direct HTML5 <audio src='...'> streaming",
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Direct audio stream for browser audio tags."
        }
    }
)
async def proxy_synthesize_get(
    text: str = Query(..., description="Text narrative to synthesize"),
    language: str = Query("hi-IN", description="Target language code"),
    voice: Optional[str] = Query(None, description="Preferred voice candidate"),
    sample_rate: int = Query(DEFAULT_SAMPLE_RATE, description="Target sample rate in Hz")
):
    """Convenience GET endpoint allowing native browser audio tag direct embedding."""
    req = TTSProxyRequest(
        text=text,
        language=language,
        voice=voice,
        sample_rate=sample_rate,
        container="wav"
    )
    return await proxy_synthesize_post(req)
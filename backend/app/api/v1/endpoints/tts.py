# backend/app/api/v1/endpoints/tts.py
"""
Production-Ready TTS Proxy Route for Gnani Timbre TTS.
Resolves MIME type alignment, binary streaming, and container configuration (48000 Hz RIFF WAV).
"""
import io
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.services.gnani.timbre_service import timbre_service

logger = logging.getLogger("dhanvantari.tts_proxy")

router = APIRouter(prefix="/tts", tags=["TTS Proxy"])


class TTSProxyRequest(BaseModel):
    text: str = Field(..., example="Ramesh ji, Paracetamol din mein teen baar khana khane ke baad lein.")
    language: str = Field(default="hi-IN", example="hi-IN")
    voice: Optional[str] = Field(default=None, example="Avinash")
    sample_rate: int = Field(default=48000, example=48000)
    container: str = Field(default="wav", example="wav")


@router.post(
    "/synthesize",
    summary="Synthesize speech with linear PCM 48kHz WAV container",
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Standard RIFF WAV linear PCM audio stream at 48000 Hz."
        }
    }
)
async def proxy_synthesize_post(request: TTSProxyRequest):
    """
    Proxies TTS synthesis to Gnani Timbre TTS:
    1. Sends explicit container: 'wav', sample_rate: 48000 parameters.
    2. Packages raw Linear PCM to standard RIFF WAV if container is not provided.
    3. Returns binary response with strict 'audio/wav' MIME type and cache controls.
    """
    try:
        audio_bytes, sample_rate = await timbre_service.synthesize_raw_wav(
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
                "x-audio-sample-rate": str(sample_rate),
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600",
            }
        )
    except Exception as exc:
        logger.error(f"TTS Proxy synthesis failed: {exc}")
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
    sample_rate: int = Query(48000, description="Target sample rate in Hz")
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

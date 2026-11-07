
from fastapi import APIRouter, HTTPException, status
from app.schemas.consultation import ConsultationCompleteRequest, ConsultationCompleteResponse
from app.services.orchestrator import orchestrator

router = APIRouter(prefix="/consultation", tags=["Consultation"])


@router.post(
    "/complete",
    response_model=ConsultationCompleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete consultation, compile PDF, generate vernacular TTS, and create WhatsApp link"
)
async def complete_consultation(request: ConsultationCompleteRequest):
    try:
        response = await orchestrator.complete_consultation(request)
        return response
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Consultation orchestration failed: {str(exc)}"
        )
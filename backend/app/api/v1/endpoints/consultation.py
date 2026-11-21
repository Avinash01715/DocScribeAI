# backend/app/api/v1/endpoints/consultation.py
import logging
from typing import List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.schemas.prescription import MedicationItem, ClinicalAlert
from app.schemas.consultation import ConsultationCompleteRequest, ConsultationCompleteResponse
from app.services.orchestrator import orchestrator
from app.utils.drug_matcher import drug_matcher
from app.utils.safety_checker import safety_checker

logger = logging.getLogger("docscribe.consultation")

# Router definition for consultation & prescription endpoints
router = APIRouter(tags=["Consultation"])


class PrescriptionValidationRequest(BaseModel):
    prescription: List[MedicationItem]
    allergies: List[str] = Field(default_factory=list)


class PrescriptionValidationResponse(BaseModel):
    prescription: List[MedicationItem]
    safety_status: str = "Verified Safe"


# Endpoint to complete consultation: builds PDF, synthesizes TTS audio, and creates WhatsApp link
@router.post(
    "/consultation/complete",
    response_model=ConsultationCompleteResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete consultation, compile PDF, generate vernacular TTS, and create WhatsApp link"
)
async def complete_consultation(request: ConsultationCompleteRequest):
    try:
        response = await orchestrator.complete_consultation(request)
        return response
    except Exception as exc:
        logger.error(f"Consultation orchestration failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Consultation orchestration failed: {str(exc)}"
        )


# Reactive endpoint to re-validate clinical safety, duplicate salts, overdose, DDIs, and allergies
@router.post(
    "/prescription/validate",
    response_model=PrescriptionValidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate prescription safety, duplicate salts, cumulative doses, DDIs, and allergies"
)
@router.post(
    "/consultation/prescription/validate",
    response_model=PrescriptionValidationResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False
)
async def validate_prescription(request: PrescriptionValidationRequest):
    try:
        # Cross-reference with formulary matcher if verified_match is missing
        for it in request.prescription:
            if not it.verified_match and it.drug_name:
                match_res = drug_matcher.verify_medication(it.drug_name)
                it.verified_match = match_res["matched_name"]
                it.confidence_score = match_res["confidence_score"]
                if match_res["requires_review"]:
                    it.requires_review = True

        evaluated = safety_checker.evaluate_prescription(
            request.prescription,
            request.allergies
        )

        overall_status = "Verified Safe"
        if any(it.safety_status == "OVERDOSE_WARNING" for it in evaluated):
            overall_status = "OVERDOSE_WARNING"
        elif any(it.safety_status == "DDI_ALERT" for it in evaluated):
            overall_status = "DDI_ALERT"

        return PrescriptionValidationResponse(
            prescription=evaluated,
            safety_status=overall_status
        )
    except Exception as exc:
        logger.error(f"Prescription validation failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prescription validation failed: {str(exc)}"
        )

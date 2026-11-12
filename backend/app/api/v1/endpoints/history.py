# backend/app/api/v1/endpoints/history.py
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from typing import List, Dict, Any, Optional, Union
from app.services.history_service import history_repo

router = APIRouter(prefix="/history", tags=["Prescription History"])


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Union[int, str]
    patient_name: str
    patient_phone: str
    phone_number: Optional[str] = None
    timestamp: str
    created_at: Optional[str] = None
    diagnosis: Optional[str] = None
    medications_count: int = 0
    audio_url: Optional[str] = None
    pdf_url: Optional[str] = None
    language: str = "hi"
    status: Optional[str] = "COMPLETED"


def _normalize_record(r: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures consistent contract mapping for both client and legacy consumers."""
    normalized = dict(r)
    # Map phone number
    if "patient_phone" not in normalized and "phone_number" in normalized:
        normalized["patient_phone"] = normalized["phone_number"]
    elif "phone_number" not in normalized and "patient_phone" in normalized:
        normalized["phone_number"] = normalized["patient_phone"]

    # Map timestamp
    if "timestamp" not in normalized and "created_at" in normalized:
        normalized["timestamp"] = str(normalized["created_at"])
    elif "created_at" not in normalized and "timestamp" in normalized:
        normalized["created_at"] = str(normalized["timestamp"])

    if "timestamp" in normalized and normalized["timestamp"] is not None:
        normalized["timestamp"] = str(normalized["timestamp"])

    normalized["language"] = normalized.get("language") or "hi"
    normalized["status"] = normalized.get("status") or "COMPLETED"
    return normalized


@router.get("", response_model=List[HistoryItem], summary="Fetch recent prescription records")
@router.get("/", response_model=List[HistoryItem], summary="Fetch recent prescription records")
@router.get("/recent", response_model=List[HistoryItem], summary="Fetch last prescription summaries")
async def get_recent_prescriptions(
    limit: int = Query(default=20, ge=1, le=100, description="Max prescription records to retrieve")
) -> List[Dict[str, Any]]:
    records = await history_repo.get_recent_records(limit=limit)
    return [_normalize_record(r) for r in records]


@router.get("/{history_id}", summary="Re-hydrate complete prescription consultation")
async def get_prescription_detail(history_id: int):
    record = await history_repo.get_record_by_id(history_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prescription record #{history_id} not found."
        )
    record["language"] = record.get("language") or "hi"
    record["status"] = record.get("status") or "COMPLETED"
    return record

# backend/app/api/v1/endpoints/history.py
from fastapi import APIRouter, HTTPException, Query, status
from typing import List, Dict, Any
from app.services.history_service import history_repo

router = APIRouter(prefix="/history", tags=["Prescription History"])


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
        normalized["timestamp"] = normalized["created_at"]
    elif "created_at" not in normalized and "timestamp" in normalized:
        normalized["created_at"] = normalized["timestamp"]

    return normalized


@router.get("", summary="Fetch recent prescription records")
@router.get("/", summary="Fetch recent prescription records")
@router.get("/recent", summary="Fetch last prescription summaries")
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
    return record

# backend/app/api/history.py
from fastapi import APIRouter, HTTPException, status
from typing import List, Dict, Any
from app.services.history_service import history_repo

router = APIRouter(prefix="/history", tags=["Prescription History"])

@router.get("/recent", summary="Fetch last 10 prescription summaries")
async def get_recent_prescriptions() -> List[Dict[str, Any]]:
    return await history_repo.get_recent_records(limit=10)

@router.get("/{history_id}", summary="Re-hydrate complete prescription consultation")
async def get_prescription_detail(history_id: int):
    record = await history_repo.get_record_by_id(history_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prescription record #{history_id} not found."
        )
    return record
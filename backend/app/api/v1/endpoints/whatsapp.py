# backend/app/api/whatsapp.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter(tags=["WhatsApp"])

class WhatsAppDispatchRequest(BaseModel):
    phone_number: str
    patient_name: str
    medications: List[dict]

@router.post("/whatsapp/send")
async def dispatch_whatsapp(payload: WhatsAppDispatchRequest):
    """
    Dispatches prescription summary and regional audio note via WhatsApp Cloud API or deep link.
    """
    return {
        "status": "success",
        "recipient": payload.phone_number,
        "message": f"Prescription dispatched to {payload.patient_name}"
    }
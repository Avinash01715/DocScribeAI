
from typing import List, Optional
from pydantic import BaseModel, Field


class MedicationItem(BaseModel):
    drug_name: str = Field(..., description="Canonical or extracted drug name")
    dosage: str = Field(..., description="Dosage quantity (e.g., 1 tablet)")
    frequency: str = Field(..., description="Clinical frequency (e.g., 1 - 1 - 1)")
    timing: str = Field(..., description="Administration timing (e.g., After meals)")
    duration: str = Field(..., description="Duration of treatment (e.g., 3 days)")
    verified_match: Optional[str] = None
    confidence_score: Optional[float] = None
    requires_review: Optional[bool] = False


class PatientInfo(BaseModel):
    name: str = Field(..., description="Patient's full name")
    age: Optional[str] = None
    gender: Optional[str] = None
    chief_complaints: List[str] = Field(default_factory=list)


class ClinicalFindings(BaseModel):
    diagnosis: str = Field(..., description="Primary clinical diagnosis")


class ConsultationCompleteRequest(BaseModel):
    patient_info: PatientInfo
    clinical_findings: ClinicalFindings
    prescription: List[MedicationItem]
    advice: Optional[str] = Field(default="", description="General doctor advice")
    phone_number: str = Field(..., description="Patient mobile number (10 digits or E.164)")
    language: str = Field(default="hi-IN", description="Target vernacular dialect for TTS")


class ConsultationCompleteResponse(BaseModel):
    status: str
    patient_name: str
    pdf_url: str
    audio_url: Optional[str] = None
    whatsapp_deep_link: str
    narrative_text: str
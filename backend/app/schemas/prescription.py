# backend/app/schemas/prescription.py
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

class MedicationItem(BaseModel):
    drug_name: str = Field(..., description="Brand or generic name of medicine")
    dosage: str = Field(..., description="e.g., 1 tablet, 650mg, 5ml")
    frequency: str = Field(..., description="Normalized OPD notation e.g. 1-1-1, 1-0-1")
    timing: str = Field(..., description="e.g. After meals, Before food")
    duration: str = Field(..., description="e.g. 3 days, 5 days")
    verified_match: Optional[str] = None
    confidence_score: float = 1.0
    requires_review: bool = False

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, v: str) -> str:
        """Converts conversational Indian colloquialisms into clean OPD frequency syntax."""
        val = v.lower().strip()
        if any(w in val for w in ["teen", "thrice", "three times", "1-1-1"]):
            return "1 - 1 - 1"
        if any(w in val for w in ["subah-shaam", "twice", "two times", "subah aur shaam", "1-0-1"]):
            return "1 - 0 - 1"
        if any(w in val for w in ["ek baar", "once", "0-0-1", "night"]):
            return "0 - 0 - 1"
        return v

class PatientInfo(BaseModel):
    name: str = "Unknown"
    chief_complaints: List[str] = Field(default_factory=list)

class ClinicalFindings(BaseModel):
    diagnosis: str = "Under Evaluation"

class PrescriptionExtractionResponse(BaseModel):
    patient_info: PatientInfo
    clinical_findings: ClinicalFindings
    prescription: List[MedicationItem]
    advice: Optional[str] = None
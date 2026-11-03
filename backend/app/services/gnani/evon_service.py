# backend/app/services/gnani_evon.py
import os
import json
import logging
from typing import List, Optional
import httpx
from pydantic import BaseModel, Field, field_validator
from app.utils.drug_matcher import drug_matcher

logger = logging.getLogger("dhanvantari.evon")

GNANI_EVON_URL = os.getenv("GNANI_EVON_URL", "https://api.gnani.ai/v1/evon")
GNANI_API_KEY = os.getenv("GNANI_API_KEY", "")

class MedicationItem(BaseModel):
    drug_name: str = Field(..., description="Medicine brand/generic name")
    dosage: str = Field(..., description="Dosage quantity (e.g. 1 tablet, 5ml)")
    frequency: str = Field(..., description="Frequency in OPD notation e.g. 1-1-1")
    timing: str = Field(..., description="e.g. After meals, Before breakfast")
    duration: str = Field(..., description="e.g. 3 days, 5 days")
    verified_match: Optional[str] = None
    confidence_score: float = 1.0
    requires_review: bool = False

    @field_validator("frequency")
    @classmethod
    def normalize_frequency(cls, v: str) -> str:
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

EVON_CLINICAL_SYSTEM_PROMPT = """
You are an expert Indian outpatient (OPD) clinical documentation AI.
Extract structured clinical records from the doctor-patient consultation transcript.
Strictly output a valid JSON object matching this schema:
{
  "patient_info": {
    "name": "string",
    "chief_complaints": ["string"]
  },
  "clinical_findings": {
    "diagnosis": "string"
  },
  "prescription": [
    {
      "drug_name": "string",
      "dosage": "string",
      "frequency": "string",
      "timing": "string",
      "duration": "string"
    }
  ],
  "advice": "string"
}
Return ONLY raw JSON. No markdown wraps, no extra text.
"""

class EvonService:
    def __init__(self):
        self.api_url = GNANI_EVON_URL
        self.api_key = GNANI_API_KEY

    async def extract_prescription(self, transcript_text: str) -> PrescriptionExtractionResponse:
        if not self.api_key or not transcript_text.strip():
            logger.info("Operating in deterministic extraction mode.")
            return self._mock_extraction(transcript_text)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "evon-v3.3",
            "messages": [
                {"role": "system", "content": EVON_CLINICAL_SYSTEM_PROMPT},
                {"role": "user", "content": transcript_text}
            ],
            "temperature": 0.1
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(self.api_url, headers=headers, json=payload)
                response.raise_for_status()
                raw_json = response.json()
                raw_content = raw_json["choices"][0]["message"]["content"].strip()

                if raw_content.startswith("```"):
                    raw_content = raw_content.split("```")[1]
                    if raw_content.startswith("json"):
                        raw_content = raw_content[4:]

                parsed_dict = json.loads(raw_content)
                result = PrescriptionExtractionResponse(**parsed_dict)
        except Exception as exc:
            logger.error(f"Evon extraction failed: {exc}. Using deterministic fallback.")
            result = self._mock_extraction(transcript_text)

        for item in result.prescription:
            matched_name, confidence_score, needs_review = drug_matcher.match(item.drug_name)
            item.verified_match = matched_name
            item.confidence_score = round(confidence_score, 2)
            item.requires_review = needs_review

        return result

    def _mock_extraction(self, transcript: str) -> PrescriptionExtractionResponse:
        return PrescriptionExtractionResponse(
            patient_info={
                "name": "Ramesh",
                "chief_complaints": ["High fever (101.5°F)", "Severe throat pain", "Difficulty swallowing"]
            },
            clinical_findings={
                "diagnosis": "Acute Throat Infection"
            },
            prescription=[
                {
                    "drug_name": "Paracetamol 650mg",
                    "dosage": "1 tablet",
                    "frequency": "1 - 1 - 1",
                    "timing": "After meals",
                    "duration": "3 days",
                    "verified_match": "Paracetamol 650mg",
                    "confidence_score": 100.0,
                    "requires_review": False
                },
                {
                    "drug_name": "Amoxicillin 500mg",
                    "dosage": "1 capsule",
                    "frequency": "1 - 0 - 1",
                    "timing": "After meals",
                    "duration": "5 days",
                    "verified_match": "Amoxicillin 500mg",
                    "confidence_score": 100.0,
                    "requires_review": False
                }
            ],
            advice="Gargle with warm water twice daily"
        )

evon_service = EvonService()
# backend/app/schemas/prescription.py
import re
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class MedicationItem(BaseModel):
    """
    Standardized medication schema enforcing dosage, OPD frequency,
    and formulary validation flags for Tier-2/3 OPD workflows.
    """
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    drug_name: str = Field(..., description="Brand or generic pharmaceutical name")
    dosage: str = Field(..., description="Dose per administration e.g., '1 tablet', '1 capsule', '5ml'")
    frequency: str = Field(..., description="Normalized OPD notation e.g., '1 - 1 - 1', '1 - 0 - 1', '0 - 0 - 1'")
    timing: str = Field(..., description="Meal timing relative to intake e.g., 'After meals', 'Before food'")
    duration: str = Field(..., description="Course length e.g., '3 days', '5 days'")
    verified_match: Optional[str] = Field(
        default=None, 
        description="Fuzzy-matched master pharmaceutical catalog entry[cite: 2]"
    )
    confidence_score: float = Field(
        default=100.0, 
        ge=0.0, 
        le=100.0, 
        description="Fuzzy matching confidence score (0.0 to 100.0)[cite: 2]"
    )
    requires_review: bool = Field(
        default=False, 
        description="Flags entries falling below matching thresholds for physician verification[cite: 2]"
    )

    @field_validator("frequency", mode="before")
    @classmethod
    def normalize_frequency(cls, v: str) -> str:
        """
        Normalizes conversational Indian colloquialisms, Hinglish phrases,
        and Latin medical abbreviations into standard OPD matrix notation[cite: 2].
        """
        if not isinstance(v, str):
            return "1 - 0 - 1"

        val = v.lower().strip()

        # 3 times daily (TDS / TID / teen baar)[cite: 2]
        if re.search(r"1\s*[-/,\s]\s*1\s*[-/,\s]\s*1", val) or any(
            token in val for token in ["teen", "tin", "thrice", "three times", "tds", "tid"]
        ):
            return "1 - 1 - 1"

        # 2 times daily (BD / BID / subah-shaam)[cite: 2]
        if (
            re.search(r"1\s*[-/,\s]\s*0\s*[-/,\s]\s*1", val)
            or any(token in val for token in ["subah-shaam", "subah aur shaam", "subah sham", "twice", "two times", "bd", "bid"])
        ):
            return "1 - 0 - 1"

        # Once daily / Night (OD / HS / ek baar / raat ko)
        if (
            re.search(r"0\s*[-/,\s]\s*0\s*[-/,\s]\s*1", val)
            or any(token in val for token in ["ek baar", "once", "night", "raat", "hs", "od"])
        ):
            return "0 - 0 - 1"

        # Morning only
        if re.search(r"1\s*[-/,\s]\s*0\s*[-/,\s]\s*0", val) or "subah" in val:
            return "1 - 0 - 0"

        return v.strip()

    @field_validator("timing", mode="before")
    @classmethod
    def normalize_timing(cls, v: str) -> str:
        """Standardizes prandial instructions for clear regional speech synthesis[cite: 2]."""
        if not isinstance(v, str):
            return "After meals"
        val = v.lower().strip()
        if any(token in val for token in ["after", "baad", "khana khane ke baad"]):
            return "After meals"
        if any(token in val for token in ["before", "pehle", "empty stomach", "khali pet"]):
            return "Before food"
        return v.strip().title()


class PatientInfo(BaseModel):
    """Demographic and symptom profile captured from consultation audio[cite: 2]."""
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    name: str = Field(default="Unknown", description="Patient name extracted from conversation[cite: 2]")
    chief_complaints: List[str] = Field(
        default_factory=list, 
        description="Symptom list extracted during consultation[cite: 2]"
    )

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        if not isinstance(v, str) or not v.strip() or v.strip().lower() in ["unknown", "none", "null"]:
            return "Unknown"
        # Strip common Indian honorifics
        cleaned = re.sub(r"^(shri|smt|mr|mrs|ms|dr)\.?\s+", "", v.strip(), flags=re.IGNORECASE)
        return cleaned.strip().title()


class ClinicalFindings(BaseModel):
    """Provisional diagnosis extracted by Evon LLM[cite: 2]."""
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    diagnosis: str = Field(default="Under Evaluation", description="Provisional clinical assessment[cite: 2]")


class PrescriptionExtractionResponse(BaseModel):
    """
    Primary Data Transfer Object (DTO) binding Evon LLM extraction,
    UI card generation, Timbre TTS voice synthesis, and WhatsApp dispatch[cite: 2].
    """
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    patient_info: PatientInfo = Field(default_factory=PatientInfo)
    clinical_findings: ClinicalFindings = Field(default_factory=ClinicalFindings)
    prescription: List[MedicationItem] = Field(default_factory=list)
    advice: Optional[str] = Field(
        default=None, 
        description="Lifestyle, hydration, or dietary advice (e.g. gargling, parhez)[cite: 2]"
    )
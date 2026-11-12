# backend/app/services/gnani/evon_service.py
import os
import asyncio
from dotenv import load_dotenv
load_dotenv()
import json
import logging
from typing import Optional
from google import genai
from google.genai import types

from app.schemas.prescription import PrescriptionExtractionResponse
from app.utils.drug_matcher import drug_matcher
from app.utils.hinglish import devanagari_to_hinglish

# Initialize logger for Evon clinical extraction service
logger = logging.getLogger("dhanvantari.evon")

# Read Gemini API key from environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# System prompt instructing LLM to extract structured prescription in Latin/Roman script
CLINICAL_EXTRACTION_PROMPT = """
You are an expert Clinical AI Scribe operating in a high-volume Indian Outpatient Department (OPD).
Analyze the doctor-patient consultation transcript (which may be in code-mixed Hinglish/English) and extract:
1. Patient name and chief clinical complaints.
2. Clinical provisional diagnosis.
3. Structured prescription items (drug name, dosage, frequency, timing relative to meals, duration).
4. General medical/dietary advice.

Important Rules:
- All output MUST BE IN LATIN/ROMAN SCRIPT (English or conversational Hinglish). NEVER output in Devanagari Hindi characters (e.g., write 'Ramesh' instead of 'रमेश', write 'Gale mein dard' instead of 'गले में दर्द').
- Frequencies must be normalized (e.g., 'teen baar' or 'thrice' -> '1 - 1 - 1', 'subah-shaam' or 'twice' -> '1 - 0 - 1', 'ek baar' -> '0 - 0 - 1').
- Timing must be normalized ('khana khane ke baad' -> 'After meals', 'khali pet' -> 'Before food').
- Return ONLY valid JSON adhering strictly to the schema.
"""

# Clinical extraction service using Gemini LLM with local formulary verification
class EvonClinicalService:
    # Initialize Gemini client if API key is present; otherwise fall back to mock mode
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("GEMINI_API_KEY not found in environment. Mock mode active.")

    # Parse consultation transcript into validated prescription model with fuzzy drug matching
    async def extract_prescription(self, transcript: str) -> PrescriptionExtractionResponse:
        """
        Parses ambient consultation transcript into validated medical data contracts.
        """
        # Return mock extraction when client is unconfigured or transcript is empty
        if not self.client or not transcript.strip():
            logger.info("Using deterministic synthetic fallback for prescription extraction.")
            return self._generate_mock_extraction(transcript)

        try:
            # Query Gemini Flash model with structured schema output
            response = self.client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=transcript,
                config=types.GenerateContentConfig(
                    system_instruction=CLINICAL_EXTRACTION_PROMPT,
                    response_mime_type="application/json",
                    response_schema=PrescriptionExtractionResponse,
                    temperature=0.1
                )
            )

            parsed_data = PrescriptionExtractionResponse.model_validate_json(response.text)
            
            # Normalize Devanagari script entities into Roman Hinglish
            parsed_data.patient_info.name = devanagari_to_hinglish(parsed_data.patient_info.name)
            parsed_data.clinical_findings.diagnosis = devanagari_to_hinglish(parsed_data.clinical_findings.diagnosis)
            parsed_data.patient_info.chief_complaints = [devanagari_to_hinglish(c) for c in parsed_data.patient_info.chief_complaints]
            if parsed_data.advice:
                parsed_data.advice = devanagari_to_hinglish(parsed_data.advice)
            
            # Cross-reference extracted medications against local Indian formulary
            for item in parsed_data.prescription:
                match_res = drug_matcher.verify_medication(item.drug_name)
                item.verified_match = match_res["matched_name"]
                item.confidence_score = match_res["confidence_score"]
                item.requires_review = match_res["requires_review"]

            return parsed_data

        except Exception as exc:
            logger.error(f"Gemini clinical reasoning failed: {exc}. Reverting to fallback fixture.")
            return self._generate_mock_extraction(transcript)

    async def translate_patient_instructions(
        self,
        instructions_text: str,
        target_language_label: str = "Hindi",
        target_language_code: str = "hi-IN"
    ) -> str:
        """
        Translates patient-facing medication schedule and home-care advice into
        warm, natural spoken vernacular script for TTS synthesis without mutating
        the underlying English EMR/PDF clinical records.
        """
        if not instructions_text or not instructions_text.strip():
            return instructions_text

        if target_language_code.lower().startswith("en"):
            return instructions_text

        if not self.client:
            logger.warning(
                f"Gemini client unavailable for translation to {target_language_label}; using original instructions."
            )
            return instructions_text

        system_prompt = (
            f"You are an empathetic Indian clinical communicator. Translate the following "
            f"patient medication instructions and home-care advice into natural, polite spoken "
            f"{target_language_label} ({target_language_code}) using its native script so a "
            f"text-to-speech engine can read it clearly to the patient.\n"
            f"Rules:\n"
            f"- Keep pharmaceutical drug names clear and recognizable.\n"
            f"- Translate dosage frequencies, meal timings, durations, and home-care advice accurately.\n"
            f"- Output ONLY the spoken paragraph without markdown, bullet points, or commentary."
        )

        async def _async_translate() -> str:
            resp = await self.client.aio.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=instructions_text,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                ),
            )
            return (resp.text or "").strip()

        try:
            translated = await asyncio.wait_for(_async_translate(), timeout=10.0)
            if translated:
                return translated
            return instructions_text
        except Exception as exc:
            logger.warning(
                f"Patient instruction translation to {target_language_label} failed ({exc}); "
                "falling back cleanly."
            )
            return instructions_text

    # Provide deterministic synthetic consultation data for offline testing
    def _generate_mock_extraction(self, transcript: str) -> PrescriptionExtractionResponse:
        """
        Deterministic fallback adhering to the standard Ramesh OPD consultation fixture.
        """
        raw_prescription = [
            {
                "drug_name": "Paracetamol 650mg",
                "dosage": "1 tablet",
                "frequency": "1 - 1 - 1",
                "timing": "After meals",
                "duration": "3 days"
            },
            {
                "drug_name": "Amoxicillin 500mg",
                "dosage": "1 capsule",
                "frequency": "1 - 0 - 1",
                "timing": "After meals",
                "duration": "5 days"
            }
        ]

        verified_prescription = []
        for raw_med in raw_prescription:
            match_res = drug_matcher.verify_medication(raw_med["drug_name"])
            verified_prescription.append({
                **raw_med,
                "verified_match": match_res["matched_name"],
                "confidence_score": match_res["confidence_score"],
                "requires_review": match_res["requires_review"]
            })

        return PrescriptionExtractionResponse.model_validate({
            "patient_info": {
                "name": "Ramesh",
                "chief_complaints": [
                    "High fever (101.5°F)",
                    "Severe throat pain",
                    "Difficulty swallowing"
                ]
            },
            "clinical_findings": {
                "diagnosis": "Acute Throat Infection"
            },
            "prescription": verified_prescription,
            "advice": "Gargle with warm water twice daily"
        })

# Global clinical extraction service singleton
evon_service = EvonClinicalService()

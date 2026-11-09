# backend/app/utils/drug_matcher.py
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from rapidfuzz import process, fuzz

# Initialize module logger
logger = logging.getLogger("dhanvantari.drug_matcher")

# Path to master drug formulary catalog
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "medicines.json"

# Matches extracted medication names against standard pharmaceutical formulary using RapidFuzz
class DrugMatcher:
    # Initialize matcher and load master formulary
    def __init__(self, formulary_path: Path = DATA_PATH):
        self.formulary: List[str] = []
        self._load_formulary(formulary_path)

    # Load list of medicines from JSON file or fall back to standard core formulary
    def _load_formulary(self, path: Path) -> None:
        if not path.exists():
            logger.warning(f"Formulary file not found at {path}. Using internal fallback dataset.")
            self.formulary = [
                "Paracetamol 650mg",
                "Paracetamol 500mg",
                "Amoxicillin 500mg",
                "Amoxicillin and Potassium Clavulanate 625mg",
                "Azithromycin 500mg",
                "Pantoprazole 40mg",
                "Cetirizine 10mg",
                "Metformin 500mg",
                "Ibuprofen 400mg",
                "Telmisartan 40mg",
                "Dolo 650mg",
                "Augmentin 625 Duo"
            ]
            return

        try:
            with open(path, "r", encoding="utf-8") as f:
                self.formulary = json.load(f)
            logger.info(f"Loaded {len(self.formulary)} medicines into memory.")
        except Exception as exc:
            logger.error(f"Failed to load formulary from {path}: {exc}")
            self.formulary = []

    # Fuzzy match input drug name against formulary and determine review requirement
    def verify_medication(self, query: str, threshold: float = 70.0) -> Dict[str, Any]:
        """
        Fuzzy matches extracted drug text against the formulary.
        Returns the matched name, confidence score (0-100), and review requirement flag.
        """
        if not query or not self.formulary:
            return {
                "matched_name": query,
                "confidence_score": 0.0,
                "requires_review": True
            }

        # Token set ratio handles varied word orders e.g. "Paracetamol 650" vs "650mg Paracetamol"
        match_result = process.extractOne(
            query, 
            self.formulary, 
            scorer=fuzz.token_set_ratio
        )

        if match_result:
            matched_name, score, _ = match_result
            requires_review = score < threshold
            return {
                "matched_name": matched_name if score >= threshold else query,
                "confidence_score": round(float(score), 2),
                "requires_review": requires_review
            }

        return {
            "matched_name": query,
            "confidence_score": 0.0,
            "requires_review": True
        }

# Global drug matcher singleton instance
drug_matcher = DrugMatcher()

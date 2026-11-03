import json
from pathlib import Path
from typing import Tuple, Optional
from rapidfuzz import process, fuzz

MEDICINES_FILE = Path(__file__).parent.parent / "data" / "medicines.json"

class DrugMatcher:
    def __init__(self):
        self.catalog = self._load_catalog()

    def _load_catalog(self) -> list[str]:
        if not MEDICINES_FILE.exists():
            # Seed default fallback catalog
            return [
                "Paracetamol 650mg", "Paracetamol 500mg", "Amoxicillin 500mg",
                "Azithromycin 500mg", "Pantoprazole 40mg", "Cetirizine 10mg",
                "Metformin 500mg", "Ibuprofen 400mg", "Telmisartan 40mg"
            ]
        with open(MEDICINES_FILE, "r") as f:
            return json.load(f)

    def match(self, candidate_name: str, threshold: float = 75.0) -> Tuple[Optional[str], float]:
        """
        Matches extracted drug names against Indian generic/brand registry.
        """
        match_result = process.extractOne(
            candidate_name, 
            self.catalog, 
            scorer=fuzz.token_sort_ratio
        )
        if match_result:
            matched_name, score, _ = match_result
            if score >= threshold:
                return matched_name, score
        return None, 0.0

drug_matcher = DrugMatcher()
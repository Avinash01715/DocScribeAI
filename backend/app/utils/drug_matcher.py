# backend/app/utils/drug_matcher.py
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from rapidfuzz import process, fuzz

# Initialize module logger
logger = logging.getLogger("docscribe.drug_matcher")

# Path to master drug formulary catalog
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "medicines.json"

# Maximum recommended daily doses in mg for common OPD medications
MAX_DAILY_DOSES = {
    "paracetamol": 4000,
    "dolo": 4000,
    "ibuprofen": 2400,
    "amoxicillin": 3000,
    "cetirizine": 20,
    "pantoprazole": 80,
    "metformin": 2550,
    "aspirin": 4000,
    "ciprofloxacin": 1500,
}

# Pairwise Drug-Drug Interaction (DDI) rules
DDI_INTERACTION_RULES = {
    frozenset(["aspirin", "ibuprofen"]): "Severe risk of gastrointestinal ulceration/bleeding.",
    frozenset(["ciprofloxacin", "antacid"]): "Chelation hazard: Antacid reduces antibiotic absorption.",
    frozenset(["paracetamol", "alcohol"]): "Hepatotoxicity alert.",
}

# Matches extracted medication names and enforces deterministic clinical safety rules
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

    # Calculate daily intake in mg based on dosage string and OPD frequency
    def calculate_daily_dose(self, drug_name: str, dosage: str, frequency: str) -> Optional[int]:
        # Extract mg per unit from dosage or drug name
        match = re.search(r"(\d+)\s*mg", f"{dosage} {drug_name}", re.IGNORECASE)
        if not match:
            return None
        mg_per_unit = int(match.group(1))

        # Count daily administrations from normalized frequency (e.g. '1 - 1 - 1' -> 3)
        parts = re.findall(r"\b\d+\b", frequency)
        daily_count = sum(int(p) for p in parts) if parts else 1
        return mg_per_unit * daily_count

    # Verify cumulative daily dose against safe ceiling
    def check_dosage_safety(self, drug_name: str, dosage: str, frequency: str) -> tuple[str, Optional[str]]:
        daily_mg = self.calculate_daily_dose(drug_name, dosage, frequency)
        if daily_mg is None:
            return "Verified Safe", None

        name_lower = drug_name.lower()
        for drug_key, max_limit in MAX_DAILY_DOSES.items():
            if drug_key in name_lower:
                if daily_mg > max_limit:
                    alert = f"OVERDOSE_WARNING: {drug_name} intake of {daily_mg}mg/day exceeds safe ceiling of {max_limit}mg/day."
                    return "OVERDOSE_WARNING", alert
                break

        return "Verified Safe", None

    # Detect pairwise contraindications between prescribed medications
    def check_drug_interactions(self, drug_names: List[str]) -> List[List[str]]:
        alerts = [[] for _ in drug_names]
        n = len(drug_names)
        for i in range(n):
            for j in range(i + 1, n):
                d1, d2 = drug_names[i].lower(), drug_names[j].lower()
                for pair, warning in DDI_INTERACTION_RULES.items():
                    k1, k2 = list(pair)
                    if (k1 in d1 and k2 in d2) or (k2 in d1 and k1 in d2):
                        alerts[i].append(f"DDI Alert: Contraindicated with {drug_names[j]} ({warning})")
                        alerts[j].append(f"DDI Alert: Contraindicated with {drug_names[i]} ({warning})")
        return alerts

    # Deterministic hybrid safety evaluator for a list of medication items
    def validate_prescription_safety(self, items: List[Any]) -> None:
        names = []
        for it in items:
            name = (
                (it.get("verified_match") or it.get("drug_name", ""))
                if isinstance(it, dict)
                else (getattr(it, "verified_match", None) or getattr(it, "drug_name", ""))
            )
            names.append(name)

        ddi_alerts = self.check_drug_interactions(names)

        for idx, it in enumerate(items):
            is_dict = isinstance(it, dict)
            drug_name = (
                (it.get("verified_match") or it.get("drug_name", ""))
                if is_dict
                else (getattr(it, "verified_match", None) or getattr(it, "drug_name", ""))
            )
            dosage = it.get("dosage", "") if is_dict else getattr(it, "dosage", "")
            freq = it.get("frequency", "") if is_dict else getattr(it, "frequency", "")

            dose_status, dose_alert = self.check_dosage_safety(drug_name, dosage, freq)
            alerts = list(ddi_alerts[idx])
            if dose_alert:
                alerts.append(dose_alert)

            status = "OVERDOSE_WARNING" if dose_status == "OVERDOSE_WARNING" else ("DDI_ALERT" if alerts else "Verified Safe")

            if is_dict:
                it["safety_status"] = status
                it["interaction_alerts"] = alerts
                if alerts:
                    it["requires_review"] = True
            else:
                it.safety_status = status
                it.interaction_alerts = alerts
                if alerts:
                    it.requires_review = True

# Global drug matcher singleton instance
drug_matcher = DrugMatcher()

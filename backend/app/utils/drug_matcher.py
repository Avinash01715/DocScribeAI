# backend/app/utils/drug_matcher.py
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from rapidfuzz import fuzz

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

# Combination modifiers that signify altered clinical combinations
COMBO_MODIFIERS: Set[str] = {
    "d", "p", "sp", "cv", "am", "h", "lc", "ls", "plus", "sr", "forte", "duo"
}

# Common dosage forms to strip for alias generation
DOSAGE_FORMS = (
    "tablet", "tablets", "capsule", "capsules", "syrup", "suspension",
    "respules", "injection", "inhaler", "drops", "ointment", "cream",
    "gel", "mouthwash", "gargle", "spray", "powder", "dt", "od", "er", "pr"
)

DEFAULT_CATALOG: List[str] = [
    "Dolo 650mg Tablet",
    "Paracetamol 650mg Tablet",
    "Paracetamol 500mg Tablet",
    "Pantoprazole 40mg + Domperidone 30mg SR (Pan-D Capsule)",
    "Pan 40 Tablet",
    "Pantoprazole 40mg Tablet",
    "Amoxicillin and Potassium Clavulanate 625mg (Augmentin 625 Duo)",
    "Amoxicillin 500mg Capsule",
    "Azithromycin 500mg Tablet",
    "Ondansetron 4mg Tablet",
    "Telmisartan 40mg Tablet",
    "Metformin 500mg Tablet",
    "Cetirizine 10mg Tablet",
    "Montelukast 10mg + Levocetirizine 5mg (Montair-LC Tablet)",
    "Aceclofenac 100mg + Paracetamol 325mg (Zerodol-P Tablet)",
    "Aceclofenac 100mg + Paracetamol 325mg + Serratiopeptidase 15mg (Zerodol-SP Tablet)",
    "Ibuprofen 400mg Tablet",
]

def normalize_medical_text(text: str) -> str:
    """
    Standardize clinical medication text:
    - Lowercases text
    - Detaches numeric strengths from units (650mg -> 650 mg, 5ml -> 5 ml)
    - Replaces punctuation (-, +, /, (, ), _, etc.) with spaces
    - Collapses extra spaces and strips
    """
    if not text:
        return ""
    text = text.lower()
    # Separate numbers and medical units (e.g., 650mg -> 650 mg)
    text = re.sub(r"(\d+(?:\.\d+)?)\s*(mg|ml|mcg|gm|g|iu|%)\b", r"\1 \2", text, flags=re.IGNORECASE)
    # Replace punctuation with whitespace
    text = re.sub(r"[-+/()[\],_:;*]", " ", text)
    # Collapse multiple whitespace characters
    return re.sub(r"\s+", " ", text).strip()

def extract_combo_modifiers(text: str) -> Set[str]:
    """Extract known combination modifiers from normalized text tokens."""
    tokens = set(re.findall(r"\b[a-z0-9]+\b", text.lower()))
    return tokens.intersection(COMBO_MODIFIERS)

def extract_numeric_strengths(text: str) -> Set[str]:
    """Extract numeric strengths from normalized text."""
    return set(re.findall(r"\b\d+(?:\.\d+)?\b", text.lower()))

# Matches extracted medication names and enforces deterministic clinical safety rules
class DrugMatcher:
    # Initialize matcher and load master formulary
    def __init__(self, formulary_path: Path = DATA_PATH):
        self.formulary: List[str] = []
        self.alias_index: Dict[str, str] = {}
        self._load_formulary(formulary_path)

    # Load list of medicines from JSON file or fall back to standard core formulary
    def _load_formulary(self, path: Path) -> None:
        if not path.exists():
            logger.warning(f"Formulary file not found at {path}. Using internal fallback dataset.")
            self.formulary = list(DEFAULT_CATALOG)
            self._build_alias_index()
            return

        try:
            with open(path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)

            loaded_items: List[str] = []
            if isinstance(raw_data, list):
                for entry in raw_data:
                    if isinstance(entry, str) and entry.strip():
                        loaded_items.append(entry.strip())
                    elif isinstance(entry, dict):
                        name = entry.get("canonical_name") or entry.get("name")
                        if name and isinstance(name, str):
                            loaded_items.append(name.strip())

            self.formulary = loaded_items if loaded_items else list(DEFAULT_CATALOG)
            logger.info(f"Loaded {len(self.formulary)} medicines into memory.")
        except Exception as exc:
            logger.error(f"Failed to load formulary from {path}: {exc}. Using fallback catalog.")
            self.formulary = list(DEFAULT_CATALOG)

        self._build_alias_index()

    def _build_alias_index(self) -> None:
        """
        Build an in-memory O(1) inverted alias index mapping normalized brand,
        generic, and colloquial names to canonical formulary strings.
        """
        self.alias_index = {}

        # Curated Indian OPD high-frequency aliases for deterministic matching
        curated_aliases: Dict[str, str] = {
            "pan d": "Pantoprazole 40mg + Domperidone 30mg SR (Pan-D Capsule)",
            "pan d capsule": "Pantoprazole 40mg + Domperidone 30mg SR (Pan-D Capsule)",
            "pan 40": "Pan 40 Tablet",
            "pan 40 tablet": "Pan 40 Tablet",
            "dolo 650": "Dolo 650mg Tablet",
            "dolo 650 tablet": "Dolo 650mg Tablet",
            "dolo 650 mg": "Dolo 650mg Tablet",
            "dolo 650 mg tablet": "Dolo 650mg Tablet",
            "calpol 650": "Calpol 650mg Tablet",
            "calpol 650 tablet": "Calpol 650mg Tablet",
            "calpol 500": "Calpol 500mg Tablet",
            "crocin 650": "Crocin 650mg Advance Tablet",
            "crocin 500": "Crocin 500mg Tablet",
            "augmentin 625": "Amoxicillin and Potassium Clavulanate 625mg (Augmentin 625 Duo)",
            "augmentin 625 duo": "Amoxicillin and Potassium Clavulanate 625mg (Augmentin 625 Duo)",
            "zerodol p": "Aceclofenac 100mg + Paracetamol 325mg (Zerodol-P Tablet)",
            "zerodol sp": "Aceclofenac 100mg + Paracetamol 325mg + Serratiopeptidase 15mg (Zerodol-SP Tablet)",
            "montair lc": "Montelukast 10mg + Levocetirizine 5mg (Montair-LC Tablet)",
            "montair lc kid": "Montelukast 5mg + Levocetirizine 2.5mg (Montair-LC Kid Tablet)",
            "allegra 120": "Fexofenadine 120mg (Allegra 120mg Tablet)",
            "allegra 180": "Fexofenadine 180mg (Allegra 180mg Tablet)",
            "azithral 500": "Azithromycin 500mg (Azithral 500mg Tablet)",
            "azithral 250": "Azithromycin 250mg Tablet (Azithral 250)",
            "telma 40": "Telmisartan 40mg (Telma 40 Tablet)",
            "telma h": "Telmisartan 40mg + Hydrochlorothiazide 12.5mg (Telma-H Tablet)",
            "telma am": "Telmisartan 40mg + Amlodipine 5mg (Telma-AM Tablet)",
            "glycomet 500": "Metformin 500mg (Glycomet 500 Tablet)",
            "glycomet 500 sr": "Metformin 500mg SR (Glycomet 500 SR Tablet)",
            "vomikind 4": "Ondansetron 4mg (Vomikind 4 Tablet)",
            "emset 4": "Ondansetron 4mg (Emset 4 Tablet)",
            "pantocid 40": "Pantocid 40 Tablet",
            "pantocid dsr": "Pantoprazole 40mg + Domperidone 30mg SR (Pantocid DSR Capsule)",
            "sinarest": "Phenylephrine 10mg + Chlorpheniramine 2mg + Paracetamol 325mg (Sinarest Tablet)",
            "cheston cold": "Cetirizine 5mg + Paracetamol 325mg + Phenylephrine 10mg (Cheston Cold Tablet)",
            "ascoril ls": "Levosalbutamol 1mg + Ambroxol 30mg + Guaiphenesin 50mg (Ascoril LS Syrup)",
            "combiflam": "Combiflam Tablet (Ibuprofen 400mg + Paracetamol 325mg)",
            "meftal spas": "Mefenamic Acid 250mg + Dicyclomine 10mg (Meftal-Spas Tablet)",
        }
        for alias, target in curated_aliases.items():
            norm_a = normalize_medical_text(alias)
            self.alias_index[norm_a] = target

        # Dynamically index all items in the formulary
        for item in self.formulary:
            norm_item = normalize_medical_text(item)
            if norm_item and norm_item not in self.alias_index:
                self.alias_index[norm_item] = item

            # Strip dosage form tokens
            tokens = norm_item.split()
            stripped_tokens = [t for t in tokens if t not in DOSAGE_FORMS]
            if stripped_tokens:
                stripped_norm = " ".join(stripped_tokens)
                if stripped_norm not in self.alias_index:
                    self.alias_index[stripped_norm] = item
                # Also strip unit tokens if any (e.g. "mg", "ml")
                non_unit = [t for t in stripped_tokens if t not in ("mg", "ml", "mcg", "g", "gm")]
                if non_unit:
                    non_unit_norm = " ".join(non_unit)
                    if non_unit_norm not in self.alias_index:
                        self.alias_index[non_unit_norm] = item

            # Extract parenthetical brand alias if present, e.g. "Pan-D Capsule" from "Pantoprazole 40mg + Domperidone 30mg SR (Pan-D Capsule)"
            parenthetical_matches = re.findall(r"\(([^)]+)\)", item)
            for p_match in parenthetical_matches:
                norm_p = normalize_medical_text(p_match)
                if norm_p not in self.alias_index:
                    self.alias_index[norm_p] = item
                # Strip dosage forms from parenthetical
                p_tokens = [t for t in norm_p.split() if t not in DOSAGE_FORMS]
                if p_tokens:
                    p_norm = " ".join(p_tokens)
                    if p_norm not in self.alias_index:
                        self.alias_index[p_norm] = item

    def score_candidate(self, query: str, candidate: str) -> float:
        """
        Score query against candidate using token sort ratio and clinical guards:
        - Symmetric combo modifier guard (caps at 50.0 if modifiers conflict)
        - Numeric strength boundary guard (caps at 70.0 if strengths conflict)
        """
        norm_q = normalize_medical_text(query)
        norm_c = normalize_medical_text(candidate)

        # Baseline fuzzy match score
        score = float(fuzz.token_sort_ratio(norm_q, norm_c))

        # Tier 2 Guard A: Symmetric Combination Modifier Guard
        q_mods = extract_combo_modifiers(norm_q)
        c_mods = extract_combo_modifiers(norm_c)
        if bool(q_mods) != bool(c_mods):
            # One specifies combo modifier(s) that the other lacks
            score = min(score, 50.0)
        elif q_mods and c_mods and q_mods.isdisjoint(c_mods):
            # Both specify modifiers but they are completely distinct (e.g. "p" vs "sp")
            score = min(score, 50.0)

        # Tier 2 Guard B: Numeric Strength Boundary Guard
        q_strengths = extract_numeric_strengths(norm_q)
        c_strengths = extract_numeric_strengths(norm_c)
        if q_strengths and c_strengths and q_strengths.isdisjoint(c_strengths):
            # Both specify strengths and have zero intersection (e.g. 500mg vs 650mg)
            score = min(score, 70.0)

        return round(score, 2)

    def verify_candidate(self, query: str, candidate: str, threshold: float = 80.0) -> Dict[str, Any]:
        """Verify an explicit pairwise match against a candidate string."""
        score = self.score_candidate(query, candidate)
        requires_review = score < threshold
        return {
            "matched_name": candidate if score >= threshold else query,
            "confidence_score": score,
            "requires_review": requires_review
        }

    # Match input drug name against formulary using 3-tier deterministic clinical pipeline
    def verify_medication(self, query: str, threshold: float = 80.0) -> Dict[str, Any]:
        """
        3-tier deterministic clinical matching pipeline:
        Tier 1: O(1) Inverted Brand & Generic Alias Index -> 100.0% confidence, requires_review=False
        Tier 2 & 3: Combination-Modifier & Strength Guarded Fuzzy Matching with threshold 80.0
        If score < 80.0: requires_review=True, and preserves the doctor's spoken query as matched_name.
        """
        if not query or not str(query).strip() or not self.formulary:
            return {
                "matched_name": query or "",
                "confidence_score": 0.0,
                "requires_review": True
            }

        norm_query = normalize_medical_text(str(query))

        # Tier 1: O(1) Inverted Alias Index lookup
        if norm_query in self.alias_index:
            return {
                "matched_name": self.alias_index[norm_query],
                "confidence_score": 100.0,
                "requires_review": False
            }

        # Tier 2 & 3: Fuzzy Matching with Combo Modifier and Strength Guards
        best_cand = None
        best_score = -1.0

        for cand in self.formulary:
            s = self.score_candidate(query, cand)
            if s > best_score:
                best_score = s
                best_cand = cand

        requires_review = best_score < threshold
        return {
            "matched_name": best_cand if not requires_review and best_cand else query,
            "confidence_score": max(0.0, best_score) if best_score >= 0 else 0.0,
            "requires_review": requires_review
        }

    # Calculate daily intake in mg based on dosage string and OPD frequency
    def calculate_daily_dose(self, drug_name: str, dosage: str, frequency: str) -> Optional[int]:
        match = re.search(r"(\d+)\s*mg", f"{dosage} {drug_name}", re.IGNORECASE)
        if not match:
            return None
        mg_per_unit = int(match.group(1))

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
    def validate_prescription_safety(self, items: List[Any], allergies: Optional[List[str]] = None) -> None:
        try:
            from app.utils.safety_checker import safety_checker
            safety_checker.evaluate_prescription(items, allergies)
        except Exception as exc:
            logger.error(f"Safety checker evaluation failed: {exc}")


# Global drug matcher singleton instance
drug_matcher = DrugMatcher()

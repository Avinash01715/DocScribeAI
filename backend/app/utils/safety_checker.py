# backend/app/utils/safety_checker.py
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Set, Tuple

from app.schemas.prescription import ClinicalAlert

logger = logging.getLogger("docscribe.safety_checker")

BASE_DIR = Path(__file__).resolve().parent.parent
SALTS_DATA_PATH = BASE_DIR / "data" / "salts.json"

# Maximum recommended daily doses (mg/day) for active chemical salts
MAX_DAILY_DOSES: Dict[str, float] = {
    "paracetamol": 4000.0,
    "ibuprofen": 2400.0,
    "amoxicillin": 3000.0,
    "cetirizine": 20.0,
    "pantoprazole": 80.0,
    "metformin": 2550.0,
    "aspirin": 4000.0,
    "ciprofloxacin": 1500.0,
    "azithromycin": 500.0,
    "ondansetron": 16.0,
    "telmisartan": 80.0,
    "spironolactone": 100.0,
    "aceclofenac": 200.0,
    "diclofenac": 150.0,
    "levofloxacin": 750.0,
    "ramipril": 10.0,
    "enalapril": 40.0,
}

# Common dosage forms to strip during normalization
DOSAGE_FORMS = (
    "tablet", "tablets", "capsule", "capsules", "syrup", "suspension",
    "respules", "injection", "inhaler", "drops", "ointment", "cream",
    "gel", "mouthwash", "gargle", "spray", "powder", "dt", "od", "er", "pr", "sr"
)

# Known generic salt keywords and their pharmacological classes
GENERIC_CLASS_MAP: Dict[str, Tuple[str, List[str], float]] = {
    "warfarin": ("warfarin", ["anticoagulant", "vitamin_k_antagonist"], 5.0),
    "acenocoumarol": ("acenocoumarol", ["anticoagulant"], 2.0),
    "paracetamol": ("paracetamol", ["analgesic", "antipyretic"], 650.0),
    "acetaminophen": ("paracetamol", ["analgesic", "antipyretic"], 650.0),
    "dolo": ("paracetamol", ["analgesic", "antipyretic"], 650.0),
    "calpol": ("paracetamol", ["analgesic", "antipyretic"], 650.0),
    "crocin": ("paracetamol", ["analgesic", "antipyretic"], 650.0),
    "ibuprofen": ("ibuprofen", ["nsaid", "analgesic", "antipyretic"], 400.0),
    "combiflam": ("ibuprofen", ["nsaid", "analgesic", "antipyretic"], 400.0),
    "aspirin": ("aspirin", ["nsaid", "antiplatelet"], 75.0),
    "ecosprin": ("aspirin", ["nsaid", "antiplatelet"], 75.0),
    "aceclofenac": ("aceclofenac", ["nsaid", "analgesic"], 100.0),
    "zerodol": ("aceclofenac", ["nsaid", "analgesic"], 100.0),
    "diclofenac": ("diclofenac", ["nsaid", "analgesic"], 50.0),
    "voveran": ("diclofenac", ["nsaid", "analgesic"], 50.0),
    "amoxicillin": ("amoxicillin", ["penicillin", "beta_lactam_antibiotic"], 500.0),
    "augmentin": ("amoxicillin", ["penicillin", "beta_lactam_antibiotic"], 500.0),
    "moxikind": ("amoxicillin", ["penicillin", "beta_lactam_antibiotic"], 500.0),
    "ampicillin": ("ampicillin", ["penicillin", "beta_lactam_antibiotic"], 500.0),
    "penicillin": ("penicillin", ["penicillin", "beta_lactam_antibiotic"], 500.0),
    "azithromycin": ("azithromycin", ["macrolide_antibiotic", "qt_prolonging"], 500.0),
    "azithral": ("azithromycin", ["macrolide_antibiotic", "qt_prolonging"], 500.0),
    "clarithromycin": ("clarithromycin", ["macrolide_antibiotic", "qt_prolonging"], 500.0),
    "ondansetron": ("ondansetron", ["antiemetic", "qt_prolonging"], 4.0),
    "vomikind": ("ondansetron", ["antiemetic", "qt_prolonging"], 4.0),
    "emset": ("ondansetron", ["antiemetic", "qt_prolonging"], 4.0),
    "levofloxacin": ("levofloxacin", ["fluoroquinolone", "qt_prolonging"], 500.0),
    "ciprofloxacin": ("ciprofloxacin", ["fluoroquinolone"], 500.0),
    "ciplox": ("ciprofloxacin", ["fluoroquinolone"], 500.0),
    "telmisartan": ("telmisartan", ["arb", "antihypertensive"], 40.0),
    "telma": ("telmisartan", ["arb", "antihypertensive"], 40.0),
    "losartan": ("losartan", ["arb", "antihypertensive"], 50.0),
    "spironolactone": ("spironolactone", ["potassium_sparing_diuretic", "diuretic"], 25.0),
    "aldactone": ("spironolactone", ["potassium_sparing_diuretic", "diuretic"], 25.0),
    "ramipril": ("ramipril", ["ace_inhibitor", "antihypertensive"], 5.0),
    "enalapril": ("enalapril", ["ace_inhibitor", "antihypertensive"], 5.0),
    "cardace": ("ramipril", ["ace_inhibitor", "antihypertensive"], 5.0),
    "pantoprazole": ("pantoprazole", ["ppi"], 40.0),
    "pan": ("pantoprazole", ["ppi"], 40.0),
    "pantocid": ("pantoprazole", ["ppi"], 40.0),
    "metformin": ("metformin", ["biguanide", "antidiabetic"], 500.0),
    "glycomet": ("metformin", ["biguanide", "antidiabetic"], 500.0),
    "digene": ("antacid", ["antacid"], 500.0),
    "gelusil": ("antacid", ["antacid"], 500.0),
    "antacid": ("antacid", ["antacid"], 500.0),
    "trimethoprim": ("trimethoprim", ["sulfonamide", "antibiotic"], 160.0),
    "sulfamethoxazole": ("sulfamethoxazole", ["sulfonamide", "antibiotic"], 800.0),
    "bactrim": ("sulfamethoxazole", ["sulfonamide", "antibiotic"], 800.0),
    "cetirizine": ("cetirizine", ["antihistamine"], 10.0),
    "cetzine": ("cetirizine", ["antihistamine"], 10.0),
}


class ClinicalSafetyChecker:
    """
    Pharmacovigilance engine providing deterministic, in-memory (<1 ms) evaluation
    of Drug-Drug Interactions (DDI), Duplicate Generic Salts, Cumulative Overdose,
    and Allergy Cross-Reactivity across outpatient prescriptions.
    """

    def __init__(self, salts_path: Path = SALTS_DATA_PATH):
        self.salts_db: Dict[str, Any] = {}
        self._load_salts_db(salts_path)

    def _load_salts_db(self, path: Path) -> None:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    self.salts_db = json.load(f)
                logger.info(f"Loaded {len(self.salts_db)} canonical salt mappings from {path}.")
            except Exception as exc:
                logger.error(f"Failed to load salts database from {path}: {exc}")
                self.salts_db = {}
        else:
            logger.warning(f"Salts database not found at {path}. Relying on internal rule table.")

    @staticmethod
    def normalize_text(text: str) -> str:
        if not text:
            return ""
        t = text.lower()
        t = re.sub(r"(\d+(?:\.\d+)?)\s*(mg|ml|mcg|gm|g|iu|%)\b", r"\1 \2", t, flags=re.IGNORECASE)
        t = re.sub(r"[-+/()[\],_:;*]", " ", t)
        return re.sub(r"\s+", " ", t).strip()

    @staticmethod
    def parse_daily_multiplier(frequency: str) -> int:
        """Parse OPD matrix or colloquial frequency into daily dosing multiplier."""
        if not frequency:
            return 1
        freq = str(frequency).strip().lower()

        # Check explicit OPD matrix notation e.g. 1 - 1 - 1, 1 - 0 - 1, 1 - 1 - 1 - 1
        digits = re.findall(r"\b\d+\b", freq)
        if len(digits) >= 2:
            return sum(int(d) for d in digits)

        if any(tok in freq for tok in ["teen", "tin", "thrice", "three times", "tds", "tid"]):
            return 3
        if any(tok in freq for tok in ["twice", "two times", "subah-shaam", "subah shaam", "bd", "bid"]):
            return 2
        if any(tok in freq for tok in ["four times", "char", "qid"]):
            return 4
        if any(tok in freq for tok in ["once", "ek baar", "night", "raat", "hs", "od"]):
            return 1

        if digits:
            val = int(digits[0])
            return val if 1 <= val <= 6 else 1
        return 1

    def resolve_medication_salts(self, drug_name: str, dosage: str = "") -> Tuple[List[Dict[str, Any]], Set[str]]:
        """
        Resolve a drug string (brand or generic) into active ingredients and drug classes.
        Returns:
            active_ingredients: [{"salt": str, "strength_mg": float}, ...]
            drug_classes: {"nsaid", "analgesic", ...}
        """
        combined_text = f"{drug_name} {dosage}".strip()
        norm_name = self.normalize_text(drug_name)

        # 1. Exact or partial match in salts_db
        if norm_name in self.salts_db:
            entry = self.salts_db[norm_name]
            return entry.get("active_ingredients", []), set(entry.get("drug_classes", []))

        # Check stripped tokens (without dosage forms)
        tokens = norm_name.split()
        stripped_tokens = [t for t in tokens if t not in DOSAGE_FORMS]
        stripped_norm = " ".join(stripped_tokens)
        if stripped_norm in self.salts_db:
            entry = self.salts_db[stripped_norm]
            return entry.get("active_ingredients", []), set(entry.get("drug_classes", []))

        # Check parenthetical brand/generic matches
        parenthetical = re.findall(r"\(([^)]+)\)", drug_name)
        for p in parenthetical:
            norm_p = self.normalize_text(p)
            if norm_p in self.salts_db:
                entry = self.salts_db[norm_p]
                return entry.get("active_ingredients", []), set(entry.get("drug_classes", []))

        # 2. Match combinations (e.g., Combiflam, Augmentin, Pan-D, Zerodol-P)
        lower_full = combined_text.lower()
        if "combiflam" in lower_full:
            return [
                {"salt": "ibuprofen", "strength_mg": 400.0},
                {"salt": "paracetamol", "strength_mg": 325.0}
            ], {"nsaid", "analgesic", "antipyretic"}

        if "augmentin" in lower_full or "moxikind cv" in lower_full or "amoxyclav" in lower_full:
            return [
                {"salt": "amoxicillin", "strength_mg": 500.0},
                {"salt": "clavulanic_acid", "strength_mg": 125.0}
            ], {"penicillin", "beta_lactam_antibiotic"}

        if "pan d" in lower_full or "pantocid dsr" in lower_full:
            return [
                {"salt": "pantoprazole", "strength_mg": 40.0},
                {"salt": "domperidone", "strength_mg": 30.0}
            ], {"ppi", "prokinetic"}

        if "zerodol p" in lower_full:
            return [
                {"salt": "aceclofenac", "strength_mg": 100.0},
                {"salt": "paracetamol", "strength_mg": 325.0}
            ], {"nsaid", "analgesic", "antipyretic"}

        if "zerodol sp" in lower_full:
            return [
                {"salt": "aceclofenac", "strength_mg": 100.0},
                {"salt": "paracetamol", "strength_mg": 325.0},
                {"salt": "serratiopeptidase", "strength_mg": 15.0}
            ], {"nsaid", "analgesic", "antipyretic"}

        if "montair lc" in lower_full or "monticope" in lower_full:
            return [
                {"salt": "montelukast", "strength_mg": 10.0},
                {"salt": "levocetirizine", "strength_mg": 5.0}
            ], {"leukotriene_receptor_antagonist", "antihistamine"}

        # 3. Rule-table heuristic fallback
        active_ingredients: List[Dict[str, Any]] = []
        drug_classes: Set[str] = set()

        # Extract numeric strength if present (e.g. "650mg" -> 650)
        strength_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:mg|g|mcg|ml)?\b", lower_full)
        parsed_strength = float(strength_match.group(1)) if strength_match else None

        for keyword, (canonical_salt, classes, default_strength) in GENERIC_CLASS_MAP.items():
            if re.search(r"\b" + re.escape(keyword) + r"\b", lower_full):
                drug_classes.update(classes)
                strength = parsed_strength if parsed_strength is not None else default_strength
                # Avoid duplicate salt entries for same drug
                if not any(ing["salt"] == canonical_salt for ing in active_ingredients):
                    active_ingredients.append({
                        "salt": canonical_salt,
                        "strength_mg": strength
                    })

        return active_ingredients, drug_classes

    def evaluate_prescription(
        self,
        prescription: List[Any],
        allergies: Optional[List[str]] = None
    ) -> List[Any]:
        """
        Evaluate full prescription list for:
        1. Duplicate Salts & Cumulative Overdose
        2. Class-Based & Pairwise DDIs
        3. Stated Patient Allergy Cross-Reactivity
        """
        if not prescription:
            return prescription

        normalized_allergies = [
            self.normalize_text(a) for a in (allergies or []) if a and str(a).strip()
        ]

        # Pre-resolve active salts and drug classes for every item
        resolved_items = []
        for idx, item in enumerate(prescription):
            is_dict = isinstance(item, dict)
            d_name = (
                item.get("verified_match") or item.get("drug_name", "")
                if is_dict
                else (getattr(item, "verified_match", None) or getattr(item, "drug_name", ""))
            )
            dosage = item.get("dosage", "") if is_dict else getattr(item, "dosage", "")
            freq = item.get("frequency", "") if is_dict else getattr(item, "frequency", "")
            override = item.get("override_acknowledged", False) if is_dict else getattr(item, "override_acknowledged", False)

            ingredients, classes = self.resolve_medication_salts(d_name, dosage)
            multiplier = self.parse_daily_multiplier(freq)

            resolved_items.append({
                "index": idx,
                "item": item,
                "is_dict": is_dict,
                "drug_name": d_name,
                "ingredients": ingredients,
                "classes": classes,
                "multiplier": multiplier,
                "override": bool(override),
                "clinical_alerts": [],
                "interaction_alerts": []
            })

        # =========================================================================
        # 1. DUPLICATE SALTS & CUMULATIVE DAILY DOSE AGGREGATION
        # =========================================================================
        salt_buckets: Dict[str, List[Dict[str, Any]]] = {}
        for r in resolved_items:
            for ing in r["ingredients"]:
                salt_name = ing["salt"]
                salt_buckets.setdefault(salt_name, []).append({
                    "res_item": r,
                    "strength_mg": ing["strength_mg"]
                })

        for salt, entries in salt_buckets.items():
            involved_drugs = list(dict.fromkeys(e["res_item"]["drug_name"] for e in entries))

            # A. Duplicate Salt Alert (Therapeutic Duplication)
            if len(entries) > 1:
                title = f"Therapeutic Duplication: {salt.title()}"
                desc = (
                    f"Multiple prescribed medications ({', '.join(involved_drugs)}) contain the "
                    f"identical active generic ingredient ({salt.title()})."
                )
                alert = ClinicalAlert(
                    alert_type="DUPLICATE_SALT",
                    severity="MAJOR",
                    title=title,
                    description=desc,
                    involved_drugs=involved_drugs,
                    can_override=True
                )
                for e in entries:
                    e["res_item"]["clinical_alerts"].append(alert)
                    e["res_item"]["interaction_alerts"].append(f"[MAJOR] {title}: {desc}")

            # B. Cumulative Daily Dose Overdose Alert
            cumulative_daily_mg = sum(
                e["strength_mg"] * e["res_item"]["multiplier"] for e in entries
            )
            ceiling = MAX_DAILY_DOSES.get(salt)
            if ceiling is not None and cumulative_daily_mg > ceiling:
                title = f"Cumulative Overdose Warning: {salt.title()}"
                desc = (
                    f"Cumulative daily intake of {salt.title()} is {int(cumulative_daily_mg)}mg/day, "
                    f"exceeding the maximum recommended safe ceiling of {int(ceiling)}mg/day "
                    f"across prescribed medications ({', '.join(involved_drugs)})."
                )
                alert = ClinicalAlert(
                    alert_type="CUMULATIVE_OVERDOSE",
                    severity="CRITICAL",
                    title=title,
                    description=desc,
                    involved_drugs=involved_drugs,
                    can_override=True
                )
                for e in entries:
                    e["res_item"]["clinical_alerts"].append(alert)
                    e["res_item"]["interaction_alerts"].append(f"[CRITICAL] {title}: {desc}")

        # =========================================================================
        # 2. CLASS-BASED & PAIRWISE DRUG-DRUG INTERACTIONS (DDI)
        # =========================================================================
        n = len(resolved_items)
        for i in range(n):
            for j in range(i + 1, n):
                r1, r2 = resolved_items[i], resolved_items[j]
                d1, d2 = r1["drug_name"], r2["drug_name"]
                c1, c2 = r1["classes"], r2["classes"]
                s1 = {ing["salt"] for ing in r1["ingredients"]}
                s2 = {ing["salt"] for ing in r2["ingredients"]}

                pair_alerts: List[ClinicalAlert] = []

                # Rule 1: Anticoagulant + NSAID (CRITICAL)
                if ("anticoagulant" in c1 and "nsaid" in c2) or ("anticoagulant" in c2 and "nsaid" in c1):
                    pair_alerts.append(ClinicalAlert(
                        alert_type="DDI",
                        severity="CRITICAL",
                        title="Critical DDI: Anticoagulant + NSAID",
                        description=(
                            f"Major hemorrhage risk: Co-administration of anticoagulant and NSAID "
                            f"({d1} + {d2}) significantly increases gastrointestinal ulceration and systemic bleeding hazard."
                        ),
                        involved_drugs=[d1, d2],
                        can_override=True
                    ))

                # Rule 2: Dual NSAID Therapy (MAJOR)
                if "nsaid" in c1 and "nsaid" in c2 and s1 != s2:
                    pair_alerts.append(ClinicalAlert(
                        alert_type="DDI",
                        severity="MAJOR",
                        title="Major DDI: Dual NSAID Therapy",
                        description=(
                            f"Additive GI and renal toxicity: Dual NSAID therapy ({d1} + {d2}) "
                            f"multiplies ulceration, renal impairment, and bleeding risk without clinical benefit."
                        ),
                        involved_drugs=[d1, d2],
                        can_override=True
                    ))

                # Rule 3: Additive QT-Interval Prolongation (MAJOR)
                if "qt_prolonging" in c1 and "qt_prolonging" in c2 and s1 != s2:
                    pair_alerts.append(ClinicalAlert(
                        alert_type="DDI",
                        severity="MAJOR",
                        title="Major DDI: QT-Interval Prolongation",
                        description=(
                            f"Cardiac risk: Co-administration of {d1} and {d2} carries additive QT-interval prolongation risk, "
                            f"increasing susceptibility to ventricular arrhythmias (Torsades de Pointes)."
                        ),
                        involved_drugs=[d1, d2],
                        can_override=True
                    ))

                # Rule 4: ACE-Inhibitor / ARB + Potassium-Sparing Diuretic (MAJOR)
                if (
                    (("ace_inhibitor" in c1 or "arb" in c1) and "potassium_sparing_diuretic" in c2)
                    or (("ace_inhibitor" in c2 or "arb" in c2) and "potassium_sparing_diuretic" in c1)
                ):
                    pair_alerts.append(ClinicalAlert(
                        alert_type="DDI",
                        severity="MAJOR",
                        title="Major DDI: Hyperkalemia Risk",
                        description=(
                            f"Electrolyte danger: Combining {d1} and {d2} significantly elevates risk of "
                            f"severe hyperkalemia and acute renal impairment. Serum potassium monitoring required."
                        ),
                        involved_drugs=[d1, d2],
                        can_override=True
                    ))

                # Rule 5: Fluoroquinolone + Antacid (MODERATE)
                if ("fluoroquinolone" in c1 and "antacid" in c2) or ("fluoroquinolone" in c2 and "antacid" in c1):
                    pair_alerts.append(ClinicalAlert(
                        alert_type="DDI",
                        severity="MODERATE",
                        title="Moderate DDI: Chelation Hazard",
                        description=(
                            f"Reduced bioavailability: Antacids containing aluminum/magnesium chelate fluoroquinolones ({d1} + {d2}), "
                            f"substantially impairing antibiotic absorption. Space intake by at least 2 hours."
                        ),
                        involved_drugs=[d1, d2],
                        can_override=True
                    ))

                for pa in pair_alerts:
                    r1["clinical_alerts"].append(pa)
                    r1["interaction_alerts"].append(f"[{pa.severity}] {pa.title}: {pa.description}")
                    r2["clinical_alerts"].append(pa)
                    r2["interaction_alerts"].append(f"[{pa.severity}] {pa.title}: {pa.description}")

        # =========================================================================
        # 3. PATIENT ALLERGY CROSS-REACTIVITY CHECK
        # =========================================================================
        if normalized_allergies:
            for r in resolved_items:
                d_name = r["drug_name"]
                classes = r["classes"]
                salts = {ing["salt"] for ing in r["ingredients"]}

                for allergy in normalized_allergies:
                    # Penicillin allergy
                    if (
                        any(term in allergy for term in ["penicillin", "amoxicillin", "ampicillin", "beta lactam", "beta-lactam"])
                        and ("penicillin" in classes or "amoxicillin" in salts or "ampicillin" in salts)
                    ):
                        alert = ClinicalAlert(
                            alert_type="ALLERGY",
                            severity="CRITICAL",
                            title=f"Critical Allergy Contraindication: Penicillin",
                            description=(
                                f"Contraindicated: Patient has a documented allergy to Penicillin, "
                                f"which has direct cross-reactivity with prescribed {d_name}."
                            ),
                            involved_drugs=[d_name],
                            can_override=True
                        )
                        r["clinical_alerts"].append(alert)
                        r["interaction_alerts"].append(f"[CRITICAL] {alert.title}: {alert.description}")

                    # Sulfa / Sulfonamide allergy
                    elif (
                        any(term in allergy for term in ["sulfa", "sulfonamide", "septran", "bactrim"])
                        and ("sulfonamide" in classes or "sulfamethoxazole" in salts)
                    ):
                        alert = ClinicalAlert(
                            alert_type="ALLERGY",
                            severity="CRITICAL",
                            title="Critical Allergy Contraindication: Sulfonamide",
                            description=(
                                f"Contraindicated: Patient has a documented Sulfa/Sulfonamide allergy, "
                                f"which contraindicates prescribed {d_name}."
                            ),
                            involved_drugs=[d_name],
                            can_override=True
                        )
                        r["clinical_alerts"].append(alert)
                        r["interaction_alerts"].append(f"[CRITICAL] {alert.title}: {alert.description}")

                    # NSAID / Aspirin allergy
                    elif (
                        any(term in allergy for term in ["nsaid", "aspirin", "brufen", "ibuprofen"])
                        and ("nsaid" in classes or "aspirin" in salts or "ibuprofen" in salts)
                    ):
                        alert = ClinicalAlert(
                            alert_type="ALLERGY",
                            severity="CRITICAL",
                            title="Critical Allergy Contraindication: NSAID",
                            description=(
                                f"Contraindicated: Patient has a documented NSAID/Aspirin allergy, "
                                f"which contraindicates prescribed {d_name}."
                            ),
                            involved_drugs=[d_name],
                            can_override=True
                        )
                        r["clinical_alerts"].append(alert)
                        r["interaction_alerts"].append(f"[CRITICAL] {alert.title}: {alert.description}")

        # =========================================================================
        # 4. ATTACH ALERTS, SAFETY STATUS & REQUIRES_REVIEW TO PRESCRIPTION ITEMS
        # =========================================================================
        for r in resolved_items:
            item = r["item"]
            is_dict = r["is_dict"]
            c_alerts = r["clinical_alerts"]
            i_alerts = list(dict.fromkeys(r["interaction_alerts"]))  # deduplicate alert strings
            is_overridden = r["override"]

            # Compute safety status
            has_overdose = any(a.alert_type == "CUMULATIVE_OVERDOSE" for a in c_alerts)
            has_critical = any(a.severity == "CRITICAL" for a in c_alerts)
            has_major = any(a.severity in ("CRITICAL", "MAJOR") for a in c_alerts)

            if has_overdose:
                status = "OVERDOSE_WARNING"
            elif c_alerts:
                status = "DDI_ALERT"
            else:
                status = "Verified Safe"

            # Determine review requirement:
            # If an item has un-overridden clinical alerts, require physician review
            needs_review = bool(c_alerts and not is_overridden)

            if is_dict:
                item["safety_status"] = status
                item["interaction_alerts"] = i_alerts
                item["clinical_alerts"] = [a.model_dump() for a in c_alerts]
                if needs_review:
                    item["requires_review"] = True
            else:
                item.safety_status = status
                item.interaction_alerts = i_alerts
                item.clinical_alerts = c_alerts
                if needs_review:
                    item.requires_review = True

        return prescription


# Singleton instance
safety_checker = ClinicalSafetyChecker()

# backend/test_formulary.py
import sys
from pathlib import Path

# Ensure backend root is on sys.path when invoked from any directory
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.utils.drug_matcher import drug_matcher  # noqa: E402


def get_loaded_catalog() -> list:
    """Supports both `formulary` and `catalog` attribute conventions on DrugMatcher."""
    return getattr(drug_matcher, "formulary", None) or getattr(drug_matcher, "catalog", [])


def run_formulary_tests() -> None:
    catalog = get_loaded_catalog()
    print(f"[*] Loaded formulary entries: {len(catalog)}")
    assert len(catalog) > 0, "Formulary catalog is empty; check backend/app/data/medicines.json."

    # 1. Exact & Brand Alias Resolution Tests
    exact_cases = [
        ("pan d", "Pan-D", 90.0),
        ("pan 40", "Pan 40", 90.0),
        ("dolo 650", "Dolo 650", 90.0),
        ("paracetamol 650mg", "Paracetamol 650", 80.0),
        ("amoxicillin 500mg", "Amoxicillin 500", 80.0),
    ]

    print("\n--- 1. Brand Alias & Canonical Match Tests ---")
    for query, expected_substr, min_score in exact_cases:
        res = drug_matcher.verify_medication(query)
        print(f"  Query: '{query}' -> {res}")
        assert expected_substr.lower() in res["matched_name"].lower(), (
            f"Expected '{expected_substr}' in matched_name for '{query}', got '{res['matched_name']}'"
        )
        assert res["confidence_score"] >= min_score, (
            f"Expected score >= {min_score} for '{query}', got {res['confidence_score']}"
        )
        assert res["requires_review"] is False, (
            f"Expected requires_review=False for '{query}', got True"
        )

    # 2. Combination-Modifier Isolation Tests (Must NOT collapse combo into single-salt)
    combo_guard_cases = [
        ("Pantoprazole 40mg D", "Pantoprazole 40mg"),
        ("Amoxicillin 500mg CV", "Amoxicillin 500mg"),
    ]

    print("\n--- 2. Combination-Modifier Guard Tests ---")
    for query, forbidden_single_salt in combo_guard_cases:
        res = drug_matcher.verify_medication(query)
        print(f"  Query: '{query}' -> {res}")
        assert not (
            res["matched_name"].strip().lower() == forbidden_single_salt.lower()
            and res["requires_review"] is False
        ), (
            f"Clinical safety failure: '{query}' collapsed into single-salt '{forbidden_single_salt}' without review!"
        )
        assert res["requires_review"] is True, (
            f"Expected requires_review=True for uncataloged combo query '{query}'"
        )

    # 3. Numeric Strength Mismatch Guard (500mg vs 650mg must flag for review if exact dose absent)
    print("\n--- 3. Strength Boundary Guard Tests ---")
    strength_res = drug_matcher.verify_medication("Paracetamol 500mg")
    print(f"  Query: 'Paracetamol 500mg' -> {strength_res}")
    if "650" in strength_res["matched_name"]:
        assert strength_res["confidence_score"] < 80.0 and strength_res["requires_review"] is True, (
            f"Strength mismatch 500mg -> 650mg scored too high: {strength_res}"
        )

    # 4. Unknown / Custom Medication Handling (Must preserve doctor's input and flag review)
    print("\n--- 4. Unverified / Custom Drug Handling ---")
    unknown_query = "Daizine syrup"
    unknown_res = drug_matcher.verify_medication(unknown_query)
    print(f"  Query: '{unknown_query}' -> {unknown_res}")
    assert unknown_res["requires_review"] is True, (
        f"Expected requires_review=True for unknown drug '{unknown_query}'"
    )
    assert unknown_res["matched_name"] == unknown_query, (
        f"Expected original query '{unknown_query}' to be preserved when unverified, got '{unknown_res['matched_name']}'"
    )

    print("\n====================================================")
    print("  [PASS] ALL FORMULARY MATCHER ASSERTIONS PASSED!   ")
    print("====================================================")


if __name__ == "__main__":
    run_formulary_tests()
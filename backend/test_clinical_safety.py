# backend/test_clinical_safety.py
import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from app.main import app
from app.utils.safety_checker import safety_checker
from app.schemas.prescription import MedicationItem

client = TestClient(app)

def test_scenario_1_warfarin_ibuprofen():
    """Scenario 1: Warfarin 5mg + Ibuprofen 400mg -> CRITICAL DDI (Bleeding hazard)."""
    items = [
        MedicationItem(
            drug_name="Warfarin 5mg",
            dosage="1 tablet",
            frequency="0 - 0 - 1",
            timing="Before food",
            duration="10 days"
        ),
        MedicationItem(
            drug_name="Ibuprofen 400mg",
            dosage="1 tablet",
            frequency="1 - 0 - 1",
            timing="After meals",
            duration="5 days"
        )
    ]
    evaluated = safety_checker.evaluate_prescription(items, [])
    
    # Check that both items got flagged with CRITICAL DDI
    critical_alerts = [
        a for it in evaluated for a in it.clinical_alerts
        if a.alert_type == "DDI" and a.severity == "CRITICAL"
    ]
    assert len(critical_alerts) >= 2, f"Expected CRITICAL DDI alerts, got: {critical_alerts}"
    assert any("anticoagulant" in a.description.lower() for a in critical_alerts)
    print("PASS: Scenario 1 (Warfarin + Ibuprofen -> CRITICAL DDI)")

def test_scenario_2_azithromycin_ondansetron():
    """Scenario 2: Azithromycin 500mg + Ondansetron 4mg -> MAJOR DDI (QT prolongation)."""
    items = [
        MedicationItem(
            drug_name="Azithromycin 500mg",
            dosage="1 tablet",
            frequency="0 - 0 - 1",
            timing="After meals",
            duration="3 days"
        ),
        MedicationItem(
            drug_name="Ondansetron 4mg",
            dosage="1 tablet",
            frequency="1 - 0 - 1",
            timing="Before food",
            duration="3 days"
        )
    ]
    evaluated = safety_checker.evaluate_prescription(items, [])
    
    qt_alerts = [
        a for it in evaluated for a in it.clinical_alerts
        if a.alert_type == "DDI" and a.severity == "MAJOR" and "qt" in a.title.lower()
    ]
    assert len(qt_alerts) >= 2, f"Expected MAJOR QT prolongation alert, got: {qt_alerts}"
    print("PASS: Scenario 2 (Azithromycin + Ondansetron -> MAJOR DDI QT)")

def test_scenario_3_duplicate_salt_and_overdose():
    """Scenario 3: Dolo 650mg + Paracetamol 650mg -> DUPLICATE_SALT and CUMULATIVE_OVERDOSE."""
    items = [
        MedicationItem(
            drug_name="Dolo 650mg",
            dosage="1 tablet",
            frequency="1 - 1 - 1 - 1",  # 4 * 650 = 2600 mg
            timing="After meals",
            duration="3 days"
        ),
        MedicationItem(
            drug_name="Paracetamol 650mg",
            dosage="1 tablet",
            frequency="1 - 1 - 1 - 1",  # 4 * 650 = 2600 mg (Total = 5200 mg > 4000 mg ceiling)
            timing="After meals",
            duration="3 days"
        )
    ]
    evaluated = safety_checker.evaluate_prescription(items, [])
    
    dup_alerts = [
        a for it in evaluated for a in it.clinical_alerts
        if a.alert_type == "DUPLICATE_SALT"
    ]
    assert len(dup_alerts) >= 2, f"Expected DUPLICATE_SALT alerts, got: {dup_alerts}"
    assert any("paracetamol" in a.title.lower() for a in dup_alerts)

    overdose_alerts = [
        a for it in evaluated for a in it.clinical_alerts
        if a.alert_type == "CUMULATIVE_OVERDOSE" and a.severity == "CRITICAL"
    ]
    assert len(overdose_alerts) >= 2, f"Expected CUMULATIVE_OVERDOSE alerts, got: {overdose_alerts}"
    assert evaluated[0].safety_status == "OVERDOSE_WARNING"
    print("PASS: Scenario 3 (Dolo + Paracetamol -> DUPLICATE_SALT & CUMULATIVE_OVERDOSE)")

def test_scenario_4_penicillin_allergy():
    """Scenario 4: allergies=['Penicillin'] + Amoxicillin 500mg -> CRITICAL ALLERGY."""
    items = [
        MedicationItem(
            drug_name="Amoxicillin 500mg",
            dosage="1 capsule",
            frequency="1 - 0 - 1",
            timing="After meals",
            duration="5 days"
        )
    ]
    evaluated = safety_checker.evaluate_prescription(items, allergies=["Penicillin"])
    
    allergy_alerts = [
        a for it in evaluated for a in it.clinical_alerts
        if a.alert_type == "ALLERGY" and a.severity == "CRITICAL"
    ]
    assert len(allergy_alerts) >= 1, f"Expected CRITICAL ALLERGY alert, got: {allergy_alerts}"
    assert "penicillin" in allergy_alerts[0].description.lower()
    print("PASS: Scenario 4 (Penicillin allergy + Amoxicillin -> CRITICAL ALLERGY)")

def test_validation_endpoint():
    """Test POST /api/v1/prescription/validate endpoint."""
    payload = {
        "prescription": [
            {
                "drug_name": "Warfarin 5mg",
                "dosage": "1 tablet",
                "frequency": "0 - 0 - 1",
                "timing": "After meals",
                "duration": "10 days"
            },
            {
                "drug_name": "Ibuprofen 400mg",
                "dosage": "1 tablet",
                "frequency": "1 - 0 - 1",
                "timing": "After meals",
                "duration": "5 days"
            }
        ],
        "allergies": []
    }
    res = client.post("/api/v1/prescription/validate", json=payload)
    assert res.status_code == 200, f"Endpoint failed: {res.text}"
    data = res.json()
    assert data["safety_status"] == "DDI_ALERT"
    assert len(data["prescription"]) == 2
    assert len(data["prescription"][0]["clinical_alerts"]) >= 1
    print("PASS: POST /api/v1/prescription/validate endpoint verified successfully")

if __name__ == "__main__":
    test_scenario_1_warfarin_ibuprofen()
    test_scenario_2_azithromycin_ondansetron()
    test_scenario_3_duplicate_salt_and_overdose()
    test_scenario_4_penicillin_allergy()
    test_validation_endpoint()
    print("\nALL 5 CLINICAL SAFETY BACKEND TESTS PASSED WITH 100% SUCCESS!")

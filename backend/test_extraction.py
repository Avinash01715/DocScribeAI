# backend/test_extraction.py
import asyncio
import json
from app.services.gnani.evon_service import evon_service
from app.utils.drug_matcher import drug_matcher

SAMPLE_CONSULTATION = """
Doctor: Namaste Ramesh ji, bataiye kya takleef hai?
Patient: Doctor sahab, do din se bahut tez bukhaar hai aur gale mein severe pain hai. Khana nigalne mein bhi dikkat ho rahi hai.
Doctor: Aap aakh kijiye... Throat mein redness aur acute infection hai. Temperature kitna tha?
Patient: Raat ko 101.5 degree tha doctor.
Doctor: Don't worry. Main Paracetamol 650mg likh raha hoon—ishe din mein teen baar khana khane ke baad lena hai, 3 din tak. Aur ek Amoxicillin 500mg antibiotic de raha hoon, subah-shaam 5 din tak. Saath mein din mein do baar garam paani se gargle kijiye.
"""

async def run_pipeline_test():
    print("[*] Testing RapidFuzz Drug Matcher...")
    match_result = drug_matcher.verify_medication("paracitamol 650")
    print(f"[+] Match result: {match_result}")
    assert match_result["matched_name"] == "Paracetamol 650mg", "Drug matching verification failed."
    assert match_result["requires_review"] is False, "Unexpected review flag on exact match."
    print("[✓] Drug Matcher verified.\n")

    print("[*] Testing Clinical Extraction via Evon Reasoning Service...")
    result = await evon_service.extract_prescription(SAMPLE_CONSULTATION)
    
    print("\n[+] Structured Clinical Output:")
    print(json.dumps(result.model_dump(), indent=2))

    # Assertions on data structure
    assert result.patient_info.name == "Ramesh", "Failed to extract patient name."
    assert len(result.prescription) >= 2, "Failed to extract all prescribed medications."
    assert result.prescription[0].frequency == "1 - 1 - 1", "Frequency normalization failed."
    assert result.prescription[1].frequency == "1 - 0 - 1", "Frequency normalization failed."
    
    print("\n=======================================================")
    print("  🎉 UPSTREAM EXTRACTION PIPELINE VERIFIED (SUCCESS)   ")
    print("=======================================================")

if __name__ == "__main__":
    asyncio.run(run_pipeline_test())
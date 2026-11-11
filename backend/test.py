import os
import time
from google import genai

# Models to compare
MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite"
]

SAMPLE_TRANSCRIPT = """
Doctor: Namaste Ramesh ji, bataiye kya takleef hai?
Patient: Doctor sahab, do din se bahut tez bukhaar hai aur gale mein severe pain hai.
Doctor: Main Paracetamol 650mg likh raha hoon, din mein teen baar khana khane ke baad, 3 din tak.
"""

def test_speed():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: Set the GEMINI_API_KEY environment variable first.")
        return

    client = genai.Client(api_key=api_key)

    print("=" * 45)
    print("      GEMINI EXTRACTION LATENCY TEST       ")
    print("=" * 45)

    prompt = (
        "Extract patient name, complaints, and medicines into JSON:\n"
        f"{SAMPLE_TRANSCRIPT}"
    )

    for model_id in MODELS:
        print(f"\nTesting: {model_id} ...", end="", flush=True)
        start_time = time.perf_counter()

        try:
            response = client.models.generate_content(
                model=model_id,
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )
            elapsed_ms = (time.perf_counter() - start_time) * 1000
            print(f" DONE in {elapsed_ms:.1f} ms")
        except Exception as exc:
            print(f" FAILED: {exc}")

    print("\n" + "=" * 45)

if __name__ == "__main__":
    test_speed()
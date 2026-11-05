import os
from dotenv import load_dotenv
from google import genai

# Load variables from .env
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is not set in backend/.env")

# Initialize client (picks up GEMINI_API_KEY automatically or via parameter)
client = genai.Client(api_key=api_key)

response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="Confirm connectivity: Reply with 'Gemini API active'."
)

print(response.text)
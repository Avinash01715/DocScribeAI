# backend/verfiy.py
import os
from dotenv import load_dotenv
from google import genai

# Load environment variables from .env file
load_dotenv()

# Verify that Gemini API key is configured
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY is not set in backend/.env")

# Initialize Google GenAI client with API key
client = genai.Client(api_key=api_key)

# Send lightweight test prompt to verify Gemini API connectivity
response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents="Confirm connectivity: Reply with 'Gemini API active'."
)

# Print API response text
print(response.text)

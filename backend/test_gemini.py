import os
import httpx
from dotenv import load_dotenv

# Try loading from standard environment files
load_dotenv(dotenv_path="../.env")
load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")

# Direct manual read fallback if dotenv caches aren't aligned
if not api_key:
    paths = [".env", "../.env", "../../.env"]
    for path in paths:
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    if line.strip().startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break
        if api_key:
            break

if not api_key:
    print("Error: GEMINI_API_KEY is empty or not set in .env file.")
    exit(1)

masked_key = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "invalid-key"
print(f"Loaded GEMINI_API_KEY: {masked_key}")

# Query Gemini 2.5 Flash
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
payload = {
    "contents": [
        {
            "parts": [{"text": "You are a clinical test assistant. Respond in exactly one sentence: 'Gemini connection verified!'"}]
        }
    ]
}

try:
    print("Sending request to Google Gemini API (gemini-2.5-flash)...")
    resp = httpx.post(url, json=payload, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()
    
    candidates = data.get("candidates") or []
    if candidates:
        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text")
        print("\nSuccess! Gemini response:")
        print(f"-> {text.strip()}")
    else:
        print("\nAPI returned success but candidates list was empty.")
        print(data)
except Exception as e:
    print(f"\nError calling Gemini API: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Response status: {e.response.status_code}")
        print(f"Response body: {e.response.text}")

#!/usr/bin/env python3
"""
Quick test script to verify Gemini API key is valid.
"""
import os
import sys

try:
    from google import genai
    from google.genai.errors import APIError
except ImportError as e:
    print(f"ERROR: Required package not installed: {e}")
    print("Install with: pip install google-genai")
    sys.exit(1)

# Check for API key
api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("ERROR: No API key found in environment")
    print("Check GEMINI_API_KEY or GOOGLE_API_KEY")
    sys.exit(1)

print(f"Found API key: {api_key[:20]}...")
print(f"Key length: {len(api_key)} characters")
print()

# Try to initialize client
try:
    client = genai.Client()
    print("✓ Client initialized successfully")
except Exception as e:
    print(f"✗ Failed to initialize client: {e}")
    sys.exit(1)

# Try a simple text generation (no image)
print("\nTesting simple text generation...")
try:
    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",  # Use a known stable model
        contents=["Say hello in exactly 3 words"]
    )
    print(f"✓ API call successful!")
    print(f"Response: {response.text}")
except APIError as e:
    print(f"✗ API Error: {e}")
    print(f"\nFull error details: {e}")
    sys.exit(1)
except Exception as e:
    print(f"✗ Unexpected error: {e}")
    sys.exit(1)

print("\n✓ API key is valid and working!")

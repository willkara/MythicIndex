# How to Fix Your Gemini API Key

## Current Problem
Your API key (`AIzaSyC6kkltRLrUnTLS...`) is being rejected by Google as expired/invalid.

## Steps to Fix

### 1. Generate a COMPLETELY NEW API Key

Go to: https://aistudio.google.com/apikey

**IMPORTANT**:
- Click "Create API key" to generate a BRAND NEW key
- Do NOT copy an existing key from the page
- Do NOT reuse any old keys you have saved elsewhere

### 2. Copy the NEW Key

When the key is generated, you'll see a popup with the key. Copy it immediately.
The key should:
- Start with `AIza`
- Be around 39 characters long
- Look like: `AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3. Update Your ~/.bashrc

Open ~/.bashrc and find the line with GOOGLE_API_KEY or GEMINI_API_KEY.
Replace the old key with your NEW key:

```bash
export GOOGLE_API_KEY="AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"  # Your NEW key here
```

### 4. Reload Your Environment

```bash
source ~/.bashrc
```

### 5. Test the New Key

```bash
cd /home/willkara/source/MemoryQuill/mythic-index/MemoryQuill/story-content
python test_gemini_key.py
```

You should see:
```
✓ API key is valid and working!
```

### 6. Run the Full Analysis

Once the test passes:
```bash
# Test on one character
python analyze_character_images.py --character aldwin-gentleheart --verbose

# Run on all characters
python analyze_character_images.py
```

## Common Issues

- **"I just created a new key but it still fails"**: Make sure you're copying the FULL key including all characters
- **"The key looks correct"**: Double-check there are no extra spaces or quotes in your ~/.bashrc
- **"Still getting expired error"**: Try waiting 1-2 minutes after creating the key - sometimes there's a propagation delay

## Testing Your Key Outside the Script

You can also test with curl:
```bash
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=YOUR_API_KEY_HERE"
```

If this returns JSON with a response, your key is valid.
If it returns an error about expiration, the key is invalid.

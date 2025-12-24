#!/bin/bash
# Helper script to update Gemini API key in ~/.bashrc

echo "Current API keys in ~/.bashrc:"
grep -n "GOOGLE_API_KEY\|GEMINI_API_KEY" ~/.bashrc

echo ""
echo "Enter your NEW API key from Google AI Studio:"
read -r NEW_KEY

if [ -z "$NEW_KEY" ]; then
    echo "ERROR: No key provided"
    exit 1
fi

# Backup bashrc
cp ~/.bashrc ~/.bashrc.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ Created backup: ~/.bashrc.backup.$(date +%Y%m%d_%H%M%S)"

# Update both keys
sed -i "s/^export GOOGLE_API_KEY=.*/export GOOGLE_API_KEY=$NEW_KEY/" ~/.bashrc
sed -i "s/^export GEMINI_API_KEY=.*/export GEMINI_API_KEY=$NEW_KEY/" ~/.bashrc

echo "✓ Updated GOOGLE_API_KEY and GEMINI_API_KEY"
echo ""
echo "New values:"
grep "GOOGLE_API_KEY\|GEMINI_API_KEY" ~/.bashrc

echo ""
echo "Now run: source ~/.bashrc"

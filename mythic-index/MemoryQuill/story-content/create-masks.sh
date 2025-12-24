#!/bin/bash

# Ensure ImageMagick is installed
if ! command -v convert &> /dev/null; then
  echo "❌ ImageMagick is not installed. Run: sudo apt install imagemagick"
  exit 1
fi

# Recursively find portrait.png files
find ./characters -type f -name "portrait.png" | while read -r portrait_path; do
  dir="$(dirname "$portrait_path")"
  mask_path="$dir/mask.png"

  # Create a transparent mask matching the portrait dimensions
  convert "$portrait_path" -alpha set -channel A -evaluate set 0 +channel "$mask_path"
  echo "🖼️ Mask created: $mask_path"
done

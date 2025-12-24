#!/bin/bash

CHARACTER_DIR="${1:-./characters}"
MAX_SIZE=$((1800 * 1024))  # 1.8MB buffer
QUALITY=100

echo "🔍 Searching for portrait.png files in: $CHARACTER_DIR"

find "$CHARACTER_DIR" -type f -iname 'portrait.png' | while read -r file; do
  size=$(stat -c%s "$file")

  if [ "$size" -le "$MAX_SIZE" ]; then
    echo "✅ Already under 2MB: $file"
    continue
  fi

  echo "⚙️ Compressing: $file ($((size / 1024)) KB)"
  temp="/tmp/portrait_tmp_$$.png"
  cp "$file" "$temp"

  for percent in 90 80 70 60 50 40 30; do
    convert "$file" -resize "$percent%" -strip -quality "$QUALITY" "$temp"
    new_size=$(stat -c%s "$temp")
    if [ "$new_size" -le "$MAX_SIZE" ]; then
      mv "$temp" "$file"
      echo "✅ Compressed to $((new_size / 1024)) KB using ${percent}% resize"
      break
    fi
  done

  if [ -f "$temp" ]; then rm "$temp"; fi
done

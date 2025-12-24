# Archived Chapter Images

## What Are These?

Each chapter directory contains an `ARCHIVED_IMAGES/` folder with restored scene images and metadata that were previously removed from the repository.

## Contents

Each `ARCHIVED_IMAGES/` directory contains:
- `imagery.yaml` - Image metadata and scene mappings
- `generation_metadata.yaml` - Image generation parameters (where applicable)
- `*.png` - Scene illustration images (896x1280, ~1-2MB each)

## How They Were Restored

The images were stored in **Git LFS** (Large File Storage) and deleted in commit `a1a053a7`. Standard `git checkout` or `git show` only retrieves LFS pointer files (132 bytes), not the actual binary content.

### The Fix

To restore LFS-tracked binary files from git history:

```bash
# For text files (yaml, md), git show works normally:
git show "COMMIT^:path/to/file.yaml" > output.yaml

# For LFS binary files, pipe through git lfs smudge:
git show "COMMIT^:path/to/image.png" | git lfs smudge > output.png
```

The `git lfs smudge` command reads an LFS pointer from stdin and outputs the actual file content by fetching it from the LFS object store.

### Full Restoration Script

```bash
cd /home/willkara/source/MemoryQuill

git ls-tree -r --name-only a1a053a7^ -- "mythic-index/MemoryQuill/story-content/chapters/" \
  | grep "imagery.yaml" \
  | while read yaml; do
      chapter=$(dirname "$yaml")
      mkdir -p "$chapter/ARCHIVED_IMAGES"

      # Text files
      git show "a1a053a7^:$yaml" > "$chapter/ARCHIVED_IMAGES/imagery.yaml"

      # Binary files via LFS
      git ls-tree -r --name-only "a1a053a7^" -- "$chapter/images/" | while read file; do
        filename=$(basename "$file")
        if [[ "$filename" == *.png ]]; then
          git show "a1a053a7^:$file" | git lfs smudge > "$chapter/ARCHIVED_IMAGES/$filename"
        else
          git show "a1a053a7^:$file" > "$chapter/ARCHIVED_IMAGES/$filename"
        fi
      done
    done
```

## Stats

- **43 chapters** with restored images
- **252 PNG images** totaling ~350MB
- **43 imagery.yaml** metadata files

## Date Restored

December 16, 2025

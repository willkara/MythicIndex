# Imagery Pipeline

Parallel processing pipeline for generating imagery specifications from story content.

## Overview

This pipeline processes your story content through a two-stage AI analysis:

### Chapter Pipeline
```
content.md → Visual Story Analyst → moment_candidates.yaml
                                          ↓
                    Illustration Art Director → imagery.yaml
```

### Location Pipeline
```
overview.md + description.md + inhabitants.md
                    ↓
         Location Story Analyst → location_analysis.yaml
                                          ↓
           Location Art Director → imagery.yaml
```

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Set API Key

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

### 3. Prepare Prompts Directory

Create a `prompts/` directory with the system prompts:

```
prompts/
├── visual-story-analyst.md
├── illustration-art-director.md
├── location-story-analyst.md
└── location-art-director.md
```

### 4. Verify Structure

```bash
python imagery_pipeline.py status
```

## Usage

### Process Everything (Chapters + Locations)

```bash
# Full pipeline for ALL content
python imagery_pipeline.py all

# With more workers
python imagery_pipeline.py all --workers 8

# Only chapters
python imagery_pipeline.py all --chapters-only

# Only locations
python imagery_pipeline.py all --locations-only

# Verbose logging
python imagery_pipeline.py all --verbose
```

### Process Mixed Batch (Specific Items)

Use the `batch` command to process a mix of chapters and locations. Prefix locations with `loc:`:

```bash
# Mix of chapters and locations
python imagery_pipeline.py batch ch01-ash-and-compass ch02-broken-shield loc:warehouse-complex

# Just specific chapters
python imagery_pipeline.py batch ch19.5-weight-of-ink ch27-official-channels

# Just specific locations  
python imagery_pipeline.py batch loc:warehouse-complex loc:wayward-compass
```

### Process All Chapters

```bash
# Full pipeline (analyst + art director)
python imagery_pipeline.py chapters --all

# With more parallel workers
python imagery_pipeline.py chapters --all --workers 8

# Verbose logging
python imagery_pipeline.py chapters --all --verbose
```

### Process Specific Chapters

```bash
python imagery_pipeline.py chapters --slugs ch01-ash-and-compass ch02-broken-shield
```

### Run Only One Stage

```bash
# Analyst only (good for review before art direction)
python imagery_pipeline.py chapters --all --stage analyst

# Art director only (requires existing moment_candidates.yaml)
python imagery_pipeline.py chapters --all --stage art-director

# Works with all commands
python imagery_pipeline.py all --stage analyst
python imagery_pipeline.py batch ch01 loc:dock-ward --stage analyst
```

### Process Locations

```bash
# All locations
python imagery_pipeline.py locations --all

# Specific locations
python imagery_pipeline.py locations --slugs warehouse-complex wayward-compass
```

### Force Reprocessing

By default, existing outputs are skipped. Use `--force` to reprocess:

```bash
python imagery_pipeline.py all --force
python imagery_pipeline.py chapters --all --force
python imagery_pipeline.py batch ch01 loc:dock-ward --force
```

### Check Status

See what's been processed:

```bash
python imagery_pipeline.py status
```

Output:
```
📚 Chapters: 47
   ✅ Complete: 12
   🔶 Analyst only: 5
   ⏳ Pending: 30
🏛️  Locations: 8
   ✅ Complete: 3
   🔶 Analyst only: 1
   ⏳ Pending: 4
```

## Output Files

### Chapter Outputs

Files are created alongside `content.md`:

```
story-content/chapters/ch01-ash-and-compass/
├── content.md                  # Source
├── moment_candidates.yaml      # Analyst output (stage 1)
└── imagery.yaml                # Art Director output (stage 2)
```

### Location Outputs

Files are created in the location directory:

```
story-content/locations/warehouse-complex/
├── overview.md                 # Source
├── description.md              # Source
├── inhabitants.md              # Source
├── location_analysis.yaml      # Analyst output (stage 1)
└── imagery.yaml                # Art Director output (stage 2)
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--workers`, `-w` | 5 | Max concurrent API calls |
| `--force`, `-f` | false | Reprocess even if output exists |
| `--verbose`, `-v` | false | Debug-level logging |
| `--stage` | full | Which stage: `analyst`, `art-director`, `full` |
| `--story-content` | `story-content` | Path to story content directory |
| `--prompts` | `prompts` | Path to prompts directory |

## CLI Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `all` | Process ALL chapters and locations | `imagery_pipeline.py all` |
| `all --chapters-only` | Process only chapters | `imagery_pipeline.py all --chapters-only` |
| `all --locations-only` | Process only locations | `imagery_pipeline.py all --locations-only` |
| `batch` | Process specific items (mix chapters + locations) | `imagery_pipeline.py batch ch01 loc:dock-ward` |
| `chapters --all` | Process all chapters | `imagery_pipeline.py chapters --all` |
| `chapters --slugs` | Process specific chapters | `imagery_pipeline.py chapters --slugs ch01 ch02` |
| `locations --all` | Process all locations | `imagery_pipeline.py locations --all` |
| `locations --slugs` | Process specific locations | `imagery_pipeline.py locations --slugs dock-ward` |
| `status` | Show processing status | `imagery_pipeline.py status` |

## Character Reference Injection

The pipeline automatically:

1. Parses `key_characters` from chapter frontmatter
2. Loads each character's files:
   - `imagery.yaml` (canonical visuals - preferred)
   - `profile.md` (fallback for visuals)
   - `development.md` (for arc context)
   - `relationships.md` (for interpersonal context)
3. Injects all character data into the analyst prompt
4. Passes canonical visuals to art director for consistency

Characters in `characters/drafts/` are loaded with `status: draft` flag.

## Error Handling

- **Automatic Retry**: API calls retry 3x with exponential backoff
- **Continue on Error**: By default, failures don't stop other items
- **Summary Report**: See all successes/failures at the end

## Example Session

```bash
# First run: check what we have
$ python imagery_pipeline.py status
📚 Chapters: 47
   ⏳ Pending: 47
🏛️  Locations: 8
   ⏳ Pending: 8

# Test with a small batch (mix of chapters and locations)
$ python imagery_pipeline.py batch ch19.5-weight-of-ink loc:warehouse-complex -v

# Review outputs, then process everything
$ python imagery_pipeline.py all --workers 8

# Or run analyst first, review, then art director
$ python imagery_pipeline.py all --stage analyst --workers 8
# ... review moment_candidates.yaml and location_analysis.yaml files ...
$ python imagery_pipeline.py all --stage art-director --workers 8

# Final status
$ python imagery_pipeline.py status
📚 Chapters: 47
   ✅ Complete: 47
🏛️  Locations: 8
   ✅ Complete: 8
```

## Estimated Processing Time

With `--workers 5` (default):

| Content | Items | Est. Time |
|---------|-------|-----------|
| Chapters (full) | 47 | ~45 min |
| Locations (full) | 8 | ~10 min |

API costs will depend on chapter/location size. Expect ~10-20k tokens per chapter (in+out combined).

## Troubleshooting

### "Prompt file not found"

Ensure your prompts directory has all four prompt files:
```bash
ls prompts/
# Should show:
# visual-story-analyst.md
# illustration-art-director.md
# location-story-analyst.md
# location-art-director.md
```

### "Character not found: xyz"

The character slug in frontmatter doesn't match a directory in `characters/` or `characters/drafts/`. Check spelling.

### Rate Limiting

If you hit rate limits, reduce workers:
```bash
python imagery_pipeline.py chapters --all --workers 2
```

### Partial Failures

Re-run without `--force` to skip successful items and retry only failures:
```bash
python imagery_pipeline.py chapters --all
```

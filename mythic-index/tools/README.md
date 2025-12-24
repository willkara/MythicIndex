# MemoryQuill Tools

Utility scripts for managing story content imagery and database synchronization.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start: Linking Images](#quick-start-linking-images)
- [Tools](#tools)
  - [link_image.py](#link_imagepy) — Link images to content (primary workflow)
  - [upload_cloudflare_images.mjs](#upload_cloudflare_imagesmjs) — Upload to Cloudflare CDN
  - [wipe_cloudflare_images.mjs](#wipe_cloudflare_imagesmjs) — Delete from Cloudflare
  - [rebuild_image_links.py](#rebuild_image_linkspy) — Legacy: rebuild from imagery.yaml
- [Image Pipeline Overview](#image-pipeline-overview)
- [Complete Wipe & Rebuild Process](#complete-wipe--rebuild-process)
- [Image Display Reference](#image-display-reference)

---

## Prerequisites

### Environment Variables

Set these before running Cloudflare tools:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_HASH="your-account-hash"
```

### Required Tools

- **Python 3.10+** for `rebuild_image_links.py`
- **Node.js 18+** for Cloudflare upload/wipe scripts
- **wrangler** CLI for D1 database operations
- **sqlite3** CLI for local database queries

---

## Quick Start: Linking Images

The fastest way to link an image to content:

```bash
cd mythic-index

# 1. Find your image asset
python tools/link_image.py --list-assets --find "maya"

# 2. Link it to a character
python tools/link_image.py character maya-chen --asset <asset-id> --role profile

# 3. Apply to D1
wrangler d1 execute mythicindex-db --remote --file frontend/import/image_link_manual.sql
```

For chapters with scenes:
```bash
# List available scenes
python tools/link_image.py --list-scenes awakening

# Link to a specific scene
python tools/link_image.py chapter awakening --asset <asset-id> --scene the-discovery
```

---

## Image Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     IMAGE DATA FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   imagery.yaml files                                            │
│   (source of truth)                                             │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────┐                                               │
│   │ image_asset │ ◄── Records for each image file               │
│   └─────────────┘     (populated by ingestion pipeline)         │
│         │                                                       │
│         ▼                                                       │
│   upload_cloudflare_images.mjs                                  │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────────┐                                           │
│   │ Cloudflare      │ ◄── Hosted images with variants           │
│   │ Images CDN      │     (thumbnail, medium, large, public)    │
│   └─────────────────┘                                           │
│         │                                                       │
│         ▼                                                       │
│   cloudflare_images_updates.sql                                 │
│   (updates image_asset with CF URLs)                            │
│         │                                                       │
│         ▼                                                       │
│   rebuild_image_links.py                                        │
│         │                                                       │
│         ▼                                                       │
│   ┌─────────────┐                                               │
│   │ image_link  │ ◄── Connects images to content                │
│   └─────────────┘     (chapter scenes, characters, locations)   │
│         │                                                       │
│         ▼                                                       │
│   Frontend renders images via Cloudflare delivery URLs          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tools

### link_image.py

**Primary workflow** for linking images to content (characters, locations, chapters).

#### Purpose

Directly creates `image_link` records without needing imagery.yaml files. Use this for manual image management.

#### Usage

```bash
cd mythic-index

# List available assets (search by filename)
python tools/link_image.py --list-assets
python tools/link_image.py --list-assets --find "maya"

# List content items
python tools/link_image.py --list-content              # All content
python tools/link_image.py --list-content character    # Just characters

# List scenes for a chapter
python tools/link_image.py --list-scenes awakening

# Link to a character
python tools/link_image.py character maya-chen --asset <id> --role profile
python tools/link_image.py character maya-chen --find "maya-portrait" --role gallery

# Link to a location
python tools/link_image.py location druid-grove --asset <id> --role establishing
python tools/link_image.py location druid-grove --asset <id> --role gallery

# Link to a chapter scene
python tools/link_image.py chapter awakening --asset <id> --scene the-discovery

# Dry run (show SQL without writing)
python tools/link_image.py character maya-chen --asset <id> --role profile --dry-run

# Apply to D1
wrangler d1 execute mythicindex-db --remote --file frontend/import/image_link_manual.sql
```

#### Options

| Option | Description |
|--------|-------------|
| `--asset`, `-a` | Image asset ID to link |
| `--find`, `-f` | Find asset by filename pattern (alternative to --asset) |
| `--role`, `-r` | Image role (see table below) |
| `--scene`, `-s` | Scene slug (for chapter images) |
| `--caption`, `-c` | Image caption |
| `--alt` | Alt text for accessibility |
| `--sort-order` | Manual sort order (auto-calculated if omitted) |
| `--dry-run` | Show SQL without writing |
| `--apply-local` | Also insert into local SQLite |

#### Roles by Content Type

| Content Type | Available Roles |
|--------------|-----------------|
| **character** | `profile` (main image), `gallery` |
| **location** | `hero`, `establishing`, `gallery` |
| **chapter** | `scene` (with --scene), `hero`, `gallery` |

#### Examples

```bash
# Set Maya's profile picture
python tools/link_image.py character maya-chen \
  --find "maya-portrait" \
  --role profile \
  --alt "Maya Chen, young woman with determined expression"

# Add establishing shot to a location
python tools/link_image.py location druid-grove \
  --asset abc-123-uuid \
  --role establishing \
  --caption "The ancient grove at dawn"

# Link scene illustration to chapter
python tools/link_image.py chapter awakening \
  --asset def-456-uuid \
  --scene the-discovery \
  --caption "Maya discovers her powers"
```

---

### rebuild_image_links.py

**Legacy tool** — Rebuilds the `image_link` database table from `imagery.yaml` source files.

#### Purpose

This script parses all `imagery.yaml` files in the story-content directory and generates SQL to populate the `image_link` table, which connects uploaded images to their associated content (chapters, characters, locations).

#### Supported Content Types

| Type | YAML Structure | Image Association |
|------|----------------|-------------------|
| **Chapters** | `scenes[].generated_images[]` | Linked to specific scene UUIDs |
| **Characters** | Top-level `generated_images[]` | Profile (first) + gallery |
| **Locations** | `parts[].generated_images[]` | Custom roles (e.g., "establishing") |

#### Usage

```bash
cd mythic-index

# Generate SQL file from imagery.yaml files
python tools/rebuild_image_links.py \
  --sqlite ../ingestion/memoryquill.db \
  --story-content MemoryQuill/story-content \
  --out-sql frontend/import/image_link_from_imagery.sql \
  --wipe-first

# Apply to D1 database
wrangler d1 execute mythicindex-db --remote --yes \
  --file frontend/import/image_link_from_imagery.sql
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--sqlite` | `../ingestion/memoryquill.db` | SQLite DB for ID lookups |
| `--story-content` | `MemoryQuill/story-content` | Root directory with imagery.yaml files |
| `--out-sql` | `frontend/import/image_link_from_imagery.sql` | Output SQL file |
| `--wipe-first` | off | Delete existing image_link records before insert |
| `--transaction` | off | Wrap in BEGIN/COMMIT (D1 rejects this) |
| `--report` | `frontend/import/image_link_rebuild_report.txt` | Missing mappings report |

#### Important Notes

- **Does NOT re-upload images** — Only rebuilds the `image_link` join table
- **Requires existing data** — `image_asset` records must exist (from prior Cloudflare Images upload)
- **Scene UUID mapping** — Looks up actual scene UUIDs from the database, not just slugs
- **Path inference** — Infers entity_type and slug from directory structure when not in YAML

---

### upload_cloudflare_images.mjs

Uploads images from local storage to Cloudflare Images and generates SQL to update the database.

#### Purpose

Reads `image_asset` records from SQLite, finds the corresponding files on disk, uploads them to Cloudflare Images, and generates SQL statements to update the database with Cloudflare delivery URLs.

#### Usage

```bash
cd mythic-index

# Dry run - see what would be uploaded
node tools/upload_cloudflare_images.mjs --dry-run

# Upload all images
node tools/upload_cloudflare_images.mjs \
  --sqlite ../ingestion/memoryquill.db \
  --out-sql frontend/import/cloudflare_images_updates.sql

# Upload only assets referenced in image_link SQL
node tools/upload_cloudflare_images.mjs \
  --only-assets-from-sql frontend/import/image_link_from_imagery.sql

# Limit to first 50 images
node tools/upload_cloudflare_images.mjs --limit 50

# Apply generated SQL to D1
wrangler d1 execute mythicindex-db --remote --yes \
  --file frontend/import/cloudflare_images_updates.sql
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--sqlite` | `../ingestion/memoryquill.db` | Source SQLite DB |
| `--out-sql` | `frontend/import/cloudflare_images_updates.sql` | Output SQL file |
| `--variants-ts` | `frontend/src/app/core/models/cloudflare-variants.ts` | Variants definition |
| `--only-assets-from-sql` | (none) | Filter to assets in this SQL file |
| `--limit` | 0 (all) | Max images to upload |
| `--dry-run` | off | Simulate without uploading |
| `--id-strategy` | `asset` | Use asset UUID as Cloudflare ID |
| `--transaction` | off | Wrap SQL in BEGIN/COMMIT |

#### Features

- **Resumable uploads** — Uses asset UUID as Cloudflare image ID; re-running skips already-uploaded images
- **Rate limit handling** — Exponential backoff with jitter for 429/5xx errors
- **Hash verification** — Warns if file hash doesn't match database record
- **Multi-path search** — Searches multiple directories to find image files

---

### wipe_cloudflare_images.mjs

Deletes all images from a Cloudflare Images account.

#### Purpose

Complete removal of all images from Cloudflare Images. Use this when you need to start fresh or clean up a test environment.

#### Usage

```bash
cd mythic-index

# List how many images exist (safe, read-only)
node tools/wipe_cloudflare_images.mjs --list-only

# Dry run - see what would be deleted
node tools/wipe_cloudflare_images.mjs --dry-run --verbose

# Delete all images (DESTRUCTIVE!)
node tools/wipe_cloudflare_images.mjs --yes-really --verbose

# Delete only first 100 images
node tools/wipe_cloudflare_images.mjs --yes-really --limit 100
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--yes-really` | off | Required safety flag to actually delete |
| `--list-only` | off | Just count images, don't delete |
| `--dry-run` | off | Simulate deletion |
| `--limit` | 0 (all) | Max images to delete |
| `--verbose` | off | Log each deletion |

#### Safety

- **Requires `--yes-really`** — Script refuses to delete without explicit confirmation
- **Rate limit handling** — Automatic retry with backoff for API errors
- **Progress logging** — Shows count every 50 deletions

---

## Complete Wipe & Rebuild Process

Use this when you need to completely recreate all image data from scratch.

### Quick Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE WIPE & REBUILD                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. WIPE CLOUDFLARE IMAGES                                      │
│     node tools/wipe_cloudflare_images.mjs --yes-really          │
│                                                                 │
│  2. WIPE DATABASE TABLES                                        │
│     DELETE FROM image_link;                                     │
│     DELETE FROM image_derivative;                               │
│     DELETE FROM image_asset;                                    │
│                                                                 │
│  3. RE-POPULATE image_asset                                     │
│     (via ingestion pipeline from imagery.yaml)                  │
│                                                                 │
│  4. UPLOAD TO CLOUDFLARE                                        │
│     node tools/upload_cloudflare_images.mjs                     │
│                                                                 │
│  5. APPLY CLOUDFLARE URLs TO DATABASE                           │
│     wrangler d1 execute --file cloudflare_images_updates.sql    │
│                                                                 │
│  6. REBUILD image_link TABLE                                    │
│     python tools/rebuild_image_links.py --wipe-first            │
│     wrangler d1 execute --file image_link_from_imagery.sql      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Steps

#### Step 1: Wipe Cloudflare Images

```bash
cd mythic-index

# First, see how many images exist
node tools/wipe_cloudflare_images.mjs --list-only

# Delete all (DESTRUCTIVE)
node tools/wipe_cloudflare_images.mjs --yes-really --verbose
```

#### Step 2: Wipe Database Tables

```bash
cd mythic-index/frontend

wrangler d1 execute mythicindex-db --remote --yes --command "
DELETE FROM image_link;
DELETE FROM image_derivative;
DELETE FROM image_asset;
"
```

#### Step 3: Re-populate image_asset

Run your ingestion pipeline to parse `imagery.yaml` files and populate `image_asset` records.

#### Step 4: Upload to Cloudflare

```bash
cd mythic-index

node tools/upload_cloudflare_images.mjs \
  --sqlite ../ingestion/memoryquill.db \
  --out-sql frontend/import/cloudflare_images_updates.sql
```

#### Step 5: Apply Cloudflare URLs

```bash
cd mythic-index/frontend

wrangler d1 execute mythicindex-db --remote --yes \
  --file import/cloudflare_images_updates.sql
```

#### Step 6: Rebuild image_link

```bash
cd mythic-index

python tools/rebuild_image_links.py \
  --sqlite ../ingestion/memoryquill.db \
  --story-content MemoryQuill/story-content \
  --out-sql frontend/import/image_link_from_imagery.sql \
  --wipe-first

cd frontend
wrangler d1 execute mythicindex-db --remote --yes \
  --file import/image_link_from_imagery.sql
```

---

## Image Display Reference

### Chapter Images (Scene-Linked)

```
┌─────────────────────────────────────────────────────────────┐
│                        CHAPTER VIEW                         │
├─────────────────────────────────────────────────────────────┤
│  Chapter Title                                              │
│  ─────────────                                              │
│                                                             │
│  [Opening paragraph text...]                                │
│                                                             │
│  ═══════════════════════════════════════════════════════    │
│  Scene: "The Awakening"                                     │
│  ═══════════════════════════════════════════════════════    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                   SCENE IMAGE                       │    │
│  │              (linked via scene_id)                  │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│  Caption: "Maya discovers her powers"                       │
│                                                             │
│  [Scene narrative content...]                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Character Images (Profile + Gallery)

```
┌─────────────────────────────────────────────────────────────┐
│                       CHARACTER VIEW                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  Character Name                           │
│  │              │  ══════════════                           │
│  │   PROFILE    │                                           │
│  │    IMAGE     │  Species: Human                           │
│  │  (role=      │  Status: Active                           │
│  │   profile)   │                                           │
│  │              │  [Character description...]               │
│  └──────────────┘                                           │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Gallery                                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                        │
│  │ GALLERY │ │ GALLERY │ │ GALLERY │                        │
│  │  IMG 1  │ │  IMG 2  │ │  IMG 3  │                        │
│  └─────────┘ └─────────┘ └─────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Location Images (Hero + Gallery)

```
┌─────────────────────────────────────────────────────────────┐
│                       LOCATION VIEW                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                    HERO IMAGE                       │    │
│  │               (role="establishing")                 │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Location Name                                              │
│  ═════════════                                              │
│                                                             │
│  [Location description...]                                  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Gallery                                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │ GALLERY │ │ GALLERY │ │ GALLERY │ │ GALLERY │            │
│  │  IMG 1  │ │  IMG 2  │ │  IMG 3  │ │  IMG 4  │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## When to Use Each Tool

| Scenario | Tool(s) to Use |
|----------|----------------|
| **Link a new image to content** | `link_image.py` |
| **Add profile/hero image** | `link_image.py --role profile` or `--role hero` |
| **Add image to chapter scene** | `link_image.py --scene <slug>` |
| **Find an image by name** | `link_image.py --list-assets --find "name"` |
| **Re-upload images to Cloudflare** | `upload_cloudflare_images.mjs` |
| **Wipe all Cloudflare images** | `wipe_cloudflare_images.mjs --yes-really` |
| **Starting fresh** | Full wipe & rebuild process |
| **Legacy: rebuild from imagery.yaml** | `rebuild_image_links.py` |

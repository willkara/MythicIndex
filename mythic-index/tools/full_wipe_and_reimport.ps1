#!/usr/bin/env pwsh
# MemoryQuill FULL Database Wipe and Re-Import Script
# Purpose: Complete database refresh - wipe ALL content and re-import everything

param(
    [switch]$SkipBackup,
    [switch]$DryRun,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "==================================================================" -ForegroundColor Red
Write-Host " WARNING: FULL DATABASE WIPE AND RE-IMPORT" -ForegroundColor Red
Write-Host "==================================================================" -ForegroundColor Red
Write-Host ""
Write-Host "This script will COMPLETELY WIPE and rebuild:" -ForegroundColor Yellow
Write-Host "  X ALL content (chapters, characters, locations, lore)" -ForegroundColor Yellow
Write-Host "  X ALL imagery (assets, derivatives, links)" -ForegroundColor Yellow
Write-Host "  X ALL scenes, metadata, relationships" -ForegroundColor Yellow
Write-Host "  X ALL embeddings and entity extractions" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then re-import:" -ForegroundColor Green
Write-Host "  + All chapters with scene data" -ForegroundColor Green
Write-Host "  + All characters with profiles" -ForegroundColor Green
Write-Host "  + All locations with descriptions" -ForegroundColor Green
Write-Host "  + All lore and worldbuilding" -ForegroundColor Green
Write-Host "  + All imagery with derivatives (256w, 768w, 1280w, 1920w)" -ForegroundColor Green
Write-Host ""

if (-not $Force -and -not $DryRun) {
    Write-Host "THIS OPERATION IS DESTRUCTIVE AND CANNOT BE UNDONE!" -ForegroundColor Red -BackgroundColor Yellow
    Write-Host ""
    $confirmation = Read-Host "Type 'WIPE ALL DATA' to continue"

    if ($confirmation -ne "WIPE ALL DATA") {
        Write-Host ""
        Write-Host "X Operation cancelled" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
}

if ($DryRun) {
    Write-Host ">>> DRY RUN MODE - No changes will be made <<<" -ForegroundColor Magenta
    Write-Host ""
}

# Navigate to backend
Set-Location "$PSScriptRoot\backend"

# Step 1: Backup database
if (-not $SkipBackup) {
    Write-Host "[1/5] Backing up current database..." -ForegroundColor Green
    $backupFile = "memoryquill_full_backup_$timestamp.db"

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would copy: memoryquill.db -> $backupFile" -ForegroundColor Gray
    } else {
        if (Test-Path "memoryquill.db") {
            Copy-Item "memoryquill.db" $backupFile
            $backupSize = (Get-Item $backupFile).Length / 1MB
            Write-Host "  [OK] Database backed up: $backupFile ($($backupSize.ToString('F2')) MB)" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] No existing database found (fresh install)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[1/5] Skipping database backup (as requested)" -ForegroundColor Yellow
}

# Step 2: Backup storage directory
Write-Host ""
Write-Host "[2/5] Backing up storage directory..." -ForegroundColor Green

if (Test-Path "storage") {
    $storageBackup = "storage_full_backup_$timestamp"

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would rename: storage -> $storageBackup" -ForegroundColor Gray
    } else {
        Rename-Item "storage" $storageBackup
        $storageSize = (Get-ChildItem $storageBackup -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "  [OK] Storage backed up: $storageBackup ($($storageSize.ToString('F2')) MB)" -ForegroundColor Green

        # Create fresh storage directories
        New-Item -ItemType Directory -Path "storage/images" -Force | Out-Null
        New-Item -ItemType Directory -Path "storage/derivatives" -Force | Out-Null
        Write-Host "  [OK] Fresh storage directories created" -ForegroundColor Green
    }
} else {
    Write-Host "  [INFO] No storage directory found (will be created during ingestion)" -ForegroundColor Cyan
}

# Step 3: Complete database wipe
Write-Host ""
Write-Host "[3/5] WIPING ALL DATABASE TABLES..." -ForegroundColor Red
Write-Host "  This will delete:" -ForegroundColor Yellow
Write-Host "    - unified_content (all content)" -ForegroundColor Gray
Write-Host "    - unified_content_metadata (all metadata)" -ForegroundColor Gray
Write-Host "    - unified_content_relationships (all relationships)" -ForegroundColor Gray
Write-Host "    - unified_content_scenes (all scenes)" -ForegroundColor Gray
Write-Host "    - unified_content_scene_characters (scene characters)" -ForegroundColor Gray
Write-Host "    - unified_content_scene_tags (scene tags)" -ForegroundColor Gray
Write-Host "    - image_asset (all images)" -ForegroundColor Gray
Write-Host "    - image_derivative (all derivatives)" -ForegroundColor Gray
Write-Host "    - image_link (all content links)" -ForegroundColor Gray
Write-Host "    - content_embedding (all embeddings)" -ForegroundColor Gray
Write-Host "    - content_entity (all extracted entities)" -ForegroundColor Gray
Write-Host ""

$sqlWipeScript = @"
-- Wipe all content and imagery tables
-- Order matters due to foreign key constraints

-- Imagery tables
DELETE FROM image_link;
DELETE FROM image_derivative;
DELETE FROM image_asset;

-- Scene tables
DELETE FROM unified_content_scene_tags;
DELETE FROM unified_content_scene_characters;
DELETE FROM unified_content_scenes;

-- Content relationships and metadata
DELETE FROM unified_content_relationships;
DELETE FROM content_embedding;
DELETE FROM content_entity;
DELETE FROM unified_content_metadata;

-- Core content (must be last due to FK constraints)
DELETE FROM unified_content;

-- Vacuum to reclaim space
VACUUM;
"@

if ($DryRun) {
    Write-Host "  [DRY RUN] Would execute SQL:" -ForegroundColor Gray
    Write-Host $sqlWipeScript -ForegroundColor Gray
} else {
    # Create temporary SQL file
    $sqlFile = "full_wipe_$timestamp.sql"
    $sqlWipeScript | Out-File -FilePath $sqlFile -Encoding utf8

    Write-Host "  Executing database wipe..." -ForegroundColor Yellow

    try {
        Get-Content $sqlFile | sqlite3 memoryquill.db 2>&1

        # Verify wipe
        $contentCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content;" 2>$null
        $imageCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM image_asset;" 2>$null
        $sceneCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content_scenes;" 2>$null

        Write-Host ""
        Write-Host "  [OK] Database wiped successfully:" -ForegroundColor Green
        Write-Host "    - Content rows: $contentCount" -ForegroundColor Gray
        Write-Host "    - Image rows: $imageCount" -ForegroundColor Gray
        Write-Host "    - Scene rows: $sceneCount" -ForegroundColor Gray
    }
    catch {
        Write-Host "  [WARN] Some tables may not exist (fresh database)" -ForegroundColor Yellow
    }
    finally {
        # Clean up SQL file
        if (Test-Path $sqlFile) {
            Remove-Item $sqlFile
        }
    }
}

# Step 4: Re-import ALL content
Write-Host ""
Write-Host "[4/5] Re-importing ALL content from story-content..." -ForegroundColor Green
Write-Host "  Content types:" -ForegroundColor Cyan
Write-Host "    - Chapters (with scene metadata)" -ForegroundColor Gray
Write-Host "    - Characters (profiles and metadata)" -ForegroundColor Gray
Write-Host "    - Locations (descriptions and parts)" -ForegroundColor Gray
Write-Host "    - Lore (worldbuilding and glossary)" -ForegroundColor Gray
Write-Host "    - Worldbuilding (systems and magic)" -ForegroundColor Gray
Write-Host ""
Write-Host "  This may take 5-15 minutes depending on content size..." -ForegroundColor Yellow
Write-Host ""

# Note: Using new unified ingestion script (backend/scripts/ingest.py)
# Imagery processing and Cloudflare sync are ON by default

# Note: The new script doesn't support --dry-run mode, but does data wipe automatically

if ($DryRun) {
    Write-Host "  [DRY RUN] Would execute:" -ForegroundColor Gray
    Write-Host "    .\.venv\Scripts\python scripts/ingest.py reingest-data --source-path ../MemoryQuill/story-content --force" -ForegroundColor Gray
} else {
    # Check and add libvips to PATH for derivative generation
    $libvipsPath = "C:\libvips\vips-dev-8.15\bin"
    $originalPath = $env:PATH
    $needsLibvips = $false

    if (Test-Path $libvipsPath) {
        if ($env:PATH -notlike "*$libvipsPath*") {
            Write-Host "  Adding libvips to PATH for derivative generation..." -ForegroundColor Yellow
            $env:PATH = "$libvipsPath;$env:PATH"
            $needsLibvips = $true
        } else {
            Write-Host "  [OK] libvips already in PATH" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARN] libvips not found at $libvipsPath" -ForegroundColor Yellow
        Write-Host "    Derivatives will not be generated without libvips" -ForegroundColor Gray
    }

    Write-Host "  Starting full content ingestion..." -ForegroundColor Cyan
    Write-Host "  (Progress will be shown by the ingestion script)" -ForegroundColor Gray
    Write-Host ""
    Write-Host ("-" * 80) -ForegroundColor DarkGray

    & ".\.venv\Scripts\python" "scripts/ingest.py" "reingest-data" "../MemoryQuill/story-content" "--force"

    # Restore original PATH
    if ($needsLibvips) {
        $env:PATH = $originalPath
    }

    Write-Host ("-" * 80) -ForegroundColor DarkGray
    Write-Host ""

    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Content ingestion completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Content ingestion failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host ""
        Write-Host "To restore backup:" -ForegroundColor Yellow
        if (-not $SkipBackup) {
            Write-Host "  Copy-Item $backupFile memoryquill.db -Force" -ForegroundColor Gray
        }
        exit $LASTEXITCODE
    }
}

# Step 5: Final statistics and verification
Write-Host ""
Write-Host "[5/5] Generating final statistics..." -ForegroundColor Green

if (-not $DryRun) {
    Write-Host ""
    Write-Host "=" * 80 -ForegroundColor Cyan
    Write-Host " Database Statistics" -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Cyan

    try {
        # Content counts (type is stored in UPPERCASE)
        $chapterCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content WHERE type='CHAPTER';"
        $characterCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content WHERE type='CHARACTER';"
        $locationCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content WHERE type='LOCATION';"
        $loreCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content WHERE type='LORE';"
        $worldbuildingCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content WHERE type='WORLDBUILDING';"
        $totalContent = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content;"

        # Scene counts
        $sceneCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content_scenes;"
        $sceneCharacterCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content_scene_characters;"

        # Imagery counts
        $assetCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM image_asset;"
        $derivativeCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM image_derivative;"
        $linkCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM image_link;"

        # Metadata counts
        $metadataCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content_metadata;"
        $relationshipCount = sqlite3 memoryquill.db "SELECT COUNT(*) FROM unified_content_relationships;"

        Write-Host ""
        Write-Host "Content:" -ForegroundColor Yellow
        Write-Host "  ├─ Chapters:        $chapterCount" -ForegroundColor White
        Write-Host "  ├─ Characters:      $characterCount" -ForegroundColor White
        Write-Host "  ├─ Locations:       $locationCount" -ForegroundColor White
        Write-Host "  ├─ Lore:            $loreCount" -ForegroundColor White
        Write-Host "  ├─ Worldbuilding:   $worldbuildingCount" -ForegroundColor White
        Write-Host "  └─ Total:           $totalContent" -ForegroundColor Green

        Write-Host ""
        Write-Host "Scenes:" -ForegroundColor Yellow
        Write-Host "  ├─ Total scenes:    $sceneCount" -ForegroundColor White
        Write-Host "  └─ Scene links:     $sceneCharacterCount" -ForegroundColor White

        Write-Host ""
        Write-Host "Imagery:" -ForegroundColor Yellow
        Write-Host "  ├─ Assets:          $assetCount" -ForegroundColor White
        Write-Host "  ├─ Derivatives:     $derivativeCount" -ForegroundColor White
        Write-Host "  └─ Content links:   $linkCount" -ForegroundColor White

        Write-Host ""
        Write-Host "Metadata:" -ForegroundColor Yellow
        Write-Host "  ├─ Metadata items:  $metadataCount" -ForegroundColor White
        Write-Host "  └─ Relationships:   $relationshipCount" -ForegroundColor White

        # Derivative breakdown
        Write-Host ""
        Write-Host "Derivative sizes:" -ForegroundColor Yellow
        $derivativeBreakdown = sqlite3 memoryquill.db "SELECT width, format, COUNT(*) as count FROM image_derivative GROUP BY width, format ORDER BY width, format;"
        $derivativeBreakdown | ForEach-Object {
            $parts = $_ -split '\|'
            if ($parts.Count -eq 3) {
                Write-Host "  - $($parts[0])w $($parts[1]): $($parts[2])" -ForegroundColor Gray
            }
        }

        # Database file size
        $dbSize = (Get-Item "memoryquill.db").Length / 1MB
        Write-Host ""
        Write-Host "Database file size: $($dbSize.ToString('F2')) MB" -ForegroundColor Cyan

    } catch {
        Write-Host "[WARN] Could not retrieve some statistics" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host " SUCCESS: Full Re-Import Complete!" -ForegroundColor Green
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""

if (-not $DryRun) {
    Write-Host "Backups created:" -ForegroundColor Yellow
    if (-not $SkipBackup -and (Test-Path "memoryquill_full_backup_$timestamp.db")) {
        Write-Host "  [FILE] Database: memoryquill_full_backup_$timestamp.db" -ForegroundColor Gray
    }
    if (Test-Path "storage_full_backup_$timestamp") {
        Write-Host "  [FILE] Storage:  storage_full_backup_$timestamp/" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review the statistics above to ensure everything imported" -ForegroundColor White
Write-Host "  2. Restart the backend API server" -ForegroundColor White
Write-Host "  3. Rebuild the frontend (ng serve)" -ForegroundColor White
Write-Host "  4. Test the reader with scene-aware context" -ForegroundColor White
Write-Host "  5. Check character portraits and imagery" -ForegroundColor White
Write-Host ""

if (-not $DryRun) {
    Write-Host "To restore from backup if needed:" -ForegroundColor Yellow
    if (-not $SkipBackup) {
        Write-Host "  Copy-Item memoryquill_full_backup_$timestamp.db memoryquill.db -Force" -ForegroundColor Gray
        Write-Host "  Rename-Item storage_full_backup_$timestamp storage -Force" -ForegroundColor Gray
    }
    Write-Host ""
}

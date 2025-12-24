# Fix Duplicate Location Name in Image Filenames
# Handles both physical file renaming and imagery.yaml updates

param(
    [string]$ContentPath = "MemoryQuill/story-content/locations",
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== Duplicate Filename Cleanup Script ===" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
}

# Statistics
$stats = @{
    LocationsScanned = 0
    FilesRenamed = 0
    YamlUpdated = 0
    Errors = 0
}

# Find all location directories
$locationDirs = Get-ChildItem -Path $ContentPath -Directory | Where-Object {
    -not $_.Name.EndsWith('-template')
}

Write-Host "Found $($locationDirs.Count) location directories" -ForegroundColor Green
Write-Host ""

foreach ($locationDir in $locationDirs) {
    $stats.LocationsScanned++
    $locationSlug = $locationDir.Name

    # Find imagery.yaml
    $yamlPath = Join-Path $locationDir.FullName "imagery.yaml"

    if (-not (Test-Path $yamlPath)) {
        continue
    }

    Write-Host "Processing: $locationSlug" -ForegroundColor Cyan

    # Read YAML content
    $yamlContent = Get-Content $yamlPath -Raw
    $modified = $false

    # Find all image files in the directory and images subdirectory
    $imageFiles = Get-ChildItem -Path $locationDir.FullName -Filter "*.png" -Recurse

    foreach ($imageFile in $imageFiles) {
        $oldName = $imageFile.Name

        # Check if filename has duplicate location slug
        # Pattern: {slug}-{slug}-{rest}.png
        $pattern = "^$locationSlug-$locationSlug-(.+)\.png$"

        if ($oldName -match $pattern) {
            $newName = "$locationSlug-$($matches[1]).png"

            Write-Host "  Found duplicate: $oldName" -ForegroundColor Yellow
            Write-Host "  Will rename to: $newName" -ForegroundColor Green

            # Rename the physical file
            $oldPath = $imageFile.FullName
            $newPath = Join-Path $locationDir.FullName $newName

            if (-not $DryRun) {
                if (Test-Path $newPath) {
                    Write-Host "  ERROR: Target file already exists: $newName" -ForegroundColor Red
                    $stats.Errors++
                    continue
                }

                try {
                    Rename-Item -Path $oldPath -NewName $newName -Force
                    Write-Host "  File renamed" -ForegroundColor Green
                    $stats.FilesRenamed++
                } catch {
                    Write-Host "  ERROR renaming file: $_" -ForegroundColor Red
                    $stats.Errors++
                    continue
                }
            } else {
                Write-Host "  [DRY RUN] Would rename file" -ForegroundColor Gray
                $stats.FilesRenamed++
            }

            # Update YAML file_name references
            $yamlContent = $yamlContent -replace [regex]::Escape($oldName), $newName

            # Also update custom_id fields (without the .png extension)
            $oldId = $oldName -replace '\.png$', ''
            $newId = $newName -replace '\.png$', ''
            $yamlContent = $yamlContent -replace [regex]::Escape($oldId), $newId

            $modified = $true
        }
    }

    # Write updated YAML if modified
    if ($modified) {
        if (-not $DryRun) {
            try {
                Set-Content -Path $yamlPath -Value $yamlContent -NoNewline -Encoding UTF8
                Write-Host "  Updated imagery.yaml" -ForegroundColor Green
                $stats.YamlUpdated++
            } catch {
                Write-Host "  ERROR updating YAML: $_" -ForegroundColor Red
                $stats.Errors++
            }
        } else {
            Write-Host "  [DRY RUN] Would update imagery.yaml" -ForegroundColor Gray
            $stats.YamlUpdated++
        }
    }

    Write-Host ""
}

# Print summary
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Locations scanned: $($stats.LocationsScanned)"
Write-Host "Files renamed: $($stats.FilesRenamed)" -ForegroundColor $(if ($stats.FilesRenamed -gt 0) { "Green" } else { "Gray" })
Write-Host "YAML files updated: $($stats.YamlUpdated)" -ForegroundColor $(if ($stats.YamlUpdated -gt 0) { "Green" } else { "Gray" })
Write-Host "Errors: $($stats.Errors)" -ForegroundColor $(if ($stats.Errors -gt 0) { "Red" } else { "Gray" })

if ($DryRun) {
    Write-Host ""
    Write-Host "This was a DRY RUN. Run without -DryRun to apply changes." -ForegroundColor Yellow
}

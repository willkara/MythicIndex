# Fix Duplicate Location Name in custom_id Fields
# This script only updates YAML files, not physical files

param(
    [string]$ContentPath = "MemoryQuill/story-content/locations",
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Stop"

Write-Host "=== Custom ID Cleanup Script ===" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
}

# Statistics
$stats = @{
    LocationsScanned = 0
    YamlUpdated = 0
    IdsFixed = 0
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
    $originalContent = $yamlContent
    $modified = $false

    # Pattern to match custom_id with duplicate location slug
    # custom_id: {slug}-{slug}-{rest}
    $pattern = "custom_id:\s+$locationSlug-$locationSlug-(.+)"

    $matches = [regex]::Matches($yamlContent, $pattern)

    if ($matches.Count -gt 0) {
        Write-Host "  Found $($matches.Count) custom_id fields to fix" -ForegroundColor Yellow

        foreach ($match in $matches) {
            $oldId = $match.Groups[0].Value
            $rest = $match.Groups[1].Value
            $newId = "custom_id: $locationSlug-$rest"

            Write-Host "    $oldId" -ForegroundColor Yellow
            Write-Host "    -> $newId" -ForegroundColor Green

            $yamlContent = $yamlContent -replace [regex]::Escape($oldId), $newId
            $modified = $true
            $stats.IdsFixed++
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
Write-Host "Custom IDs fixed: $($stats.IdsFixed)" -ForegroundColor $(if ($stats.IdsFixed -gt 0) { "Green" } else { "Gray" })
Write-Host "YAML files updated: $($stats.YamlUpdated)" -ForegroundColor $(if ($stats.YamlUpdated -gt 0) { "Green" } else { "Gray" })
Write-Host "Errors: $($stats.Errors)" -ForegroundColor $(if ($stats.Errors -gt 0) { "Red" } else { "Gray" })

if ($DryRun) {
    Write-Host ""
    Write-Host "This was a DRY RUN. Run without -DryRun to apply changes." -ForegroundColor Yellow
}

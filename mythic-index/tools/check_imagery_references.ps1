# Script to check all references in imagery.yaml files and report issues

$chapterDir = "E:\source\MemoryQuill\MemoryQuill\story-content\chapters"
$contentRoot = "E:\source\MemoryQuill\MemoryQuill\story-content"

$missingFiles = @()
$missingSections = @()
$successfulRefs = 0

Write-Host "Checking all imagery.yaml references..." -ForegroundColor Cyan
Write-Host ""

Get-ChildItem -Path $chapterDir -Recurse -Filter "imagery.yaml" | ForEach-Object {
    $yamlFile = $_
    $content = Get-Content $yamlFile.FullName -Raw -Encoding UTF8

    # Parse YAML manually to find file/section references
    $lines = $content -split "`n"
    $currentFile = $null
    $currentSection = $null

    for ($i = 0; $i -lt $lines.Length; $i++) {
        $line = $lines[$i]

        if ($line -match '^\s+file:\s*(.+?)\s*$') {
            $currentFile = $matches[1]
        }
        elseif ($line -match '^\s+section:\s*(.+?)\s*$') {
            $currentSection = $matches[1]

            if ($currentFile -and $currentSection) {
                # Construct full path
                $fullPath = Join-Path $contentRoot $currentFile

                if (-not (Test-Path $fullPath)) {
                    $missingFiles += [PSCustomObject]@{
                        YamlFile = $yamlFile.Name
                        RefFile = $currentFile
                        Section = $currentSection
                    }
                }
                else {
                    # Check if section exists
                    $fileContent = Get-Content $fullPath -Raw -Encoding UTF8
                    $sectionPattern = "^#{1,3}\s+$([regex]::Escape($currentSection))\s*$"

                    if ($fileContent -notmatch $sectionPattern) {
                        # Check available sections
                        $availableSections = Select-String -Path $fullPath -Pattern "^#{1,3}\s+(.+?)\s*$" | ForEach-Object {
                            if ($_.Line -match "^#{1,3}\s+(.+?)\s*$") {
                                $matches[1]
                            }
                        }

                        $missingSections += [PSCustomObject]@{
                            YamlFile = $yamlFile.Name
                            RefFile = $currentFile
                            RequestedSection = $currentSection
                            AvailableSections = $availableSections -join ", "
                        }
                    }
                    else {
                        $successfulRefs++
                    }
                }

                $currentFile = $null
                $currentSection = $null
            }
        }
    }
}

# Report results
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "REFERENCE CHECK RESULTS" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "✓ Successful references: $successfulRefs" -ForegroundColor Green
Write-Host ""

if ($missingFiles.Count -gt 0) {
    Write-Host "✗ MISSING FILES ($($missingFiles.Count)):" -ForegroundColor Red
    Write-Host ""
    $missingFiles | Group-Object RefFile | ForEach-Object {
        Write-Host "  File: $($_.Name)" -ForegroundColor Yellow
        $_.Group | ForEach-Object {
            Write-Host "    Referenced in: $($_.YamlFile) (section: $($_.Section))" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

if ($missingSections.Count -gt 0) {
    Write-Host "✗ MISSING SECTIONS ($($missingSections.Count)):" -ForegroundColor Red
    Write-Host ""
    $missingSections | Group-Object RefFile | ForEach-Object {
        Write-Host "  File: $($_.Name)" -ForegroundColor Yellow
        $_.Group | Select-Object -First 1 | ForEach-Object {
            Write-Host "    Requested: $($_.RequestedSection)" -ForegroundColor Gray
            Write-Host "    Available: $($_.AvailableSections)" -ForegroundColor Gray
        }
        Write-Host "    Referenced in: $($_.Group.YamlFile -join ', ')" -ForegroundColor DarkGray
        Write-Host ""
    }
}

Write-Host "================================================" -ForegroundColor Cyan

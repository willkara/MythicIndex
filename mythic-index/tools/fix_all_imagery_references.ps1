# Script to fix all imagery.yaml reference issues

$chapterDir = "E:\source\MemoryQuill\MemoryQuill\story-content\chapters"
$filesUpdated = 0
$totalReplacements = 0

Write-Host "Fixing imagery.yaml reference issues..." -ForegroundColor Cyan
Write-Host ""

# Define all the replacements we need to make
$replacements = @(
    # Fix character file paths (missing /profile.md)
    @{ Old = 'file: characters/marcus-heartbridge.md'; New = 'file: characters/marcus-heartbridge/profile.md' },
    @{ Old = 'file: characters/thorne-brightward.md'; New = 'file: characters/thorne-brightward/profile.md' },
    @{ Old = 'file: characters/veyra-thornwake.md'; New = 'file: characters/veyra-thornwake/profile.md' },

    # Fix section names (Profile -> Visual Summary)
    @{ Old = 'file: characters/corporal-hayes/profile.md[\r\n\s]+section: Profile'; New = "file: characters/corporal-hayes/profile.md`n    section: Visual Summary" },
    @{ Old = 'file: characters/lieutenant-tomaq/profile.md[\r\n\s]+section: Profile'; New = "file: characters/lieutenant-tomaq/profile.md`n    section: Visual Summary" },
    @{ Old = 'file: characters/private-mill/profile.md[\r\n\s]+section: Profile'; New = "file: characters/private-mill/profile.md`n    section: Visual Summary" },
    @{ Old = 'file: characters/trooper-carrick/profile.md[\r\n\s]+section: Profile'; New = "file: characters/trooper-carrick/profile.md`n    section: Visual Summary" },

    # Fix dock-ward-warehouse-complex section
    @{ Old = 'file: locations/dock-ward-warehouse-complex/overview.md[\r\n\s]+section: description'; New = "file: locations/dock-ward-warehouse-complex/overview.md`n    section: Visual Summary" }
)

Get-ChildItem -Path $chapterDir -Recurse -Filter "imagery.yaml" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $originalContent = $content
    $fileUpdated = $false

    foreach ($replacement in $replacements) {
        if ($content -match $replacement.Old) {
            $content = $content -replace $replacement.Old, $replacement.New
            $fileUpdated = $true
            $totalReplacements++
        }
    }

    if ($fileUpdated) {
        Set-Content -Path $file.FullName -Value $content -Encoding UTF8 -NoNewline
        $filesUpdated++
        Write-Host "✓ Updated: $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Files updated: $filesUpdated" -ForegroundColor Green
Write-Host "  Total replacements: $totalReplacements" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Now handle the files that don't exist - comment them out
Write-Host "Commenting out references to non-existent files..." -ForegroundColor Yellow
Write-Host ""

$nonExistentFiles = @(
    'characters/echo-raven/profile.md',
    'characters/journey-healer-loran/profile.md',
    'locations/dock-ward/overview.md',
    'objects/veyras-lantern/description.md',
    'chapters/ch07-the-westwall-welcome/objects/veyras-lantern/description.md'
)

$filesWithComments = 0

Get-ChildItem -Path $chapterDir -Recurse -Filter "imagery.yaml" | ForEach-Object {
    $file = $_
    $lines = Get-Content $file.FullName -Encoding UTF8
    $modified = $false
    $inReference = $false
    $referenceStartLine = -1

    for ($i = 0; $i -lt $lines.Count; $i++) {
        # Check if this line references a non-existent file
        foreach ($nonExistentFile in $nonExistentFiles) {
            if ($lines[$i] -match "file:\s*$([regex]::Escape($nonExistentFile))") {
                # Found a reference to non-existent file
                # Comment out this line and the next line (section)
                if (-not $lines[$i].TrimStart().StartsWith('#')) {
                    $lines[$i] = "  # MISSING FILE: " + $lines[$i].TrimStart()
                    if ($i + 1 -lt $lines.Count -and $lines[$i + 1] -match '^\s+section:') {
                        $lines[$i + 1] = "  # " + $lines[$i + 1].TrimStart()
                    }
                    $modified = $true
                }
            }
        }
    }

    if ($modified) {
        Set-Content -Path $file.FullName -Value $lines -Encoding UTF8
        $filesWithComments++
        Write-Host "✓ Commented out missing references in: $($file.Name)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Files with commented references: $filesWithComments" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

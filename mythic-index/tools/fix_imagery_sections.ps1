# Script to update imagery.yaml files to use correct section names
# Replaces 'visual-keys' with 'Visual Summary' (which has fallback logic)

$chapterDir = "E:\source\MemoryQuill\MemoryQuill\story-content\chapters"
$filesUpdated = 0
$replacementsMade = 0

Write-Host "Finding imagery.yaml files with 'visual-keys' references..." -ForegroundColor Cyan

Get-ChildItem -Path $chapterDir -Recurse -Filter "imagery.yaml" | ForEach-Object {
    $file = $_
    $content = Get-Content $file.FullName -Raw -Encoding UTF8

    if ($content -match 'section:\s*visual-keys') {
        Write-Host "`nProcessing: $($file.FullName)" -ForegroundColor Yellow

        # Count occurrences before replacement
        $matches = ([regex]::Matches($content, 'section:\s*visual-keys')).Count

        # Replace 'section: visual-keys' with 'section: Visual Summary'
        $newContent = $content -replace 'section:\s*visual-keys', 'section: Visual Summary'

        # Save the file
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline

        $filesUpdated++
        $replacementsMade += $matches

        Write-Host "  ✓ Updated $matches occurrence(s)" -ForegroundColor Green
    }
}

Write-Host "`n" -NoNewline
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Files updated: $filesUpdated" -ForegroundColor Green
Write-Host "  Total replacements: $replacementsMade" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

if ($filesUpdated -gt 0) {
    Write-Host "`nNote: 'Visual Summary' will automatically fall back to:" -ForegroundColor Yellow
    Write-Host "  1. Physical Description" -ForegroundColor Gray
    Write-Host "  2. Appearance" -ForegroundColor Gray
    Write-Host "  (as configured in the parser's fallback logic)" -ForegroundColor Gray
}

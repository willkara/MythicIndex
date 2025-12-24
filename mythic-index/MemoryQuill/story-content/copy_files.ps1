# 1. Set the destination directory
$destination = "RAGGER"

# 2. Create the destination directory if it doesn't exist
if (-not (Test-Path -Path $destination)) {
    New-Item -ItemType Directory -Path $destination
}

# 3. Define the source directories
$sourceDirs = @("core", "chapters", "characters", "locations", "worldbuilding")

# 4. Loop through each source directory
foreach ($dir in $sourceDirs) {
    # 5. Get all markdown files recursively
    Get-ChildItem -Path $dir -Filter *.md -Recurse | ForEach-Object {
        # 6. Construct the new filename
        # Get the full path of the file and remove the base path to get the relative path
        $relativePath = $_.FullName.Substring($pwd.Path.Length + 1)
        # Replace directory separators with a hyphen
        $newName = $relativePath -replace '[\\/]', '-'
        
        # 7. Construct the destination path
        $destinationPath = Join-Path -Path $destination -ChildPath $newName

        # 8. Copy the file
        Copy-Item -Path $_.FullName -Destination $destinationPath
    }
}

Write-Host "Files copied successfully."

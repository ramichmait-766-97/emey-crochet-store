param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$previousImageKitKey = $env:IMAGEKIT_PRIVATE_KEY

function Invoke-Migration {
    param([string[]]$MigrationArguments)
    & npm.cmd --prefix $source run productseed -- --migrate-images @MigrationArguments
    if ($LASTEXITCODE -ne 0) { throw 'Image migration stopped. See the error above; completed products can be skipped on retry.' }
}

try {
    # Reuse the existing local-copy runner and the Firebase login on this VM.
    Invoke-Migration
    if ($Apply) {
        if ([string]::IsNullOrWhiteSpace($env:IMAGEKIT_PRIVATE_KEY)) {
            $imageKitSecret = Read-Host 'ImageKit private API key (hidden)' -AsSecureString
            $env:IMAGEKIT_PRIVATE_KEY = [System.Net.NetworkCredential]::new('', $imageKitSecret).Password
            $imageKitSecret = $null
        }
        Invoke-Migration -MigrationArguments @('--apply')
    } else {
        Write-Host 'Preview only. Run this command again with -Apply to migrate the photos.'
    }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    $env:IMAGEKIT_PRIVATE_KEY = $previousImageKitKey
}

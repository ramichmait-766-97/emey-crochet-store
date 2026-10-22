param([switch]$BuildOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Executable failed (exit $LASTEXITCODE). Deployment stopped."
    }
}

try {
    $source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $deployRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'EmeyCrochet\deploy'))
    $destination = [IO.Path]::GetFullPath((Join-Path $deployRoot 'project'))
    # /MIR removes stale source files only from this dedicated local build copy.
    if ($destination.StartsWith('\\') -or
        $destination -ne (Join-Path $deployRoot 'project') -or
        $source.TrimEnd('\') -eq $destination.TrimEnd('\') -or
        $source.StartsWith($deployRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The deployment copy must be separate from the source and on a local disk.'
    }

    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
    $nodeVersion = & $node -p 'process.versions.node'
    $parts = $nodeVersion.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    if (!(($major -eq 20 -and $minor -ge 19) -or
          ($major -eq 22 -and $minor -ge 12) -or $major -eq 24)) {
        throw "Unsupported Node $nodeVersion. Use Node 22.12+ or Node 24."
    }

    Write-Host "Syncing project to $destination"
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    & robocopy.exe $source $destination /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS `
        /XD node_modules .git .angular dist .firebase output .artifacts (Join-Path $source 'functions\lib') `
        /XF .env '.env.*' 'serviceAccount*.json' '*service-account*.json' '*.log' .firebaserc .firebase-dependencies
    if ($LASTEXITCODE -ge 8) { throw "Project copy failed (robocopy exit $LASTEXITCODE)." }

    Push-Location $destination
    try {
        $manifestHash = (Get-FileHash package.json -Algorithm SHA256).Hash
        $lockHash = (Get-FileHash package-lock.json -Algorithm SHA256).Hash
        $signature = "$manifestHash/$lockHash/node-$major"
        $stamp = Join-Path $destination '.firebase-dependencies'
        $angularCli = Join-Path $destination 'node_modules\@angular\cli\bin\ng.js'
        $firebaseCli = Join-Path $destination 'node_modules\firebase-tools\lib\bin\firebase.js'
        if (!(Test-Path $stamp) -or !(Test-Path $angularCli) -or !(Test-Path $firebaseCli) -or
            (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $signature) {
            Write-Host 'Installing dependencies on the local VM disk...'
            Invoke-Checked $npm @('ci', '--no-audit', '--no-fund')
            Set-Content -LiteralPath $stamp -Value $signature
        }

        Write-Host 'Running storefront regression checks...'
        Invoke-Checked $npm @('test')
        Write-Host 'Building production storefront...'
        Invoke-Checked $node @($angularCli, 'build', '--configuration', 'production')
        if (!$BuildOnly) {
            Write-Host 'Deploying Hosting and Firestore rules to emey-crochet-store...'
            Invoke-Checked $node @($firebaseCli, 'deploy', '--project', 'emey-crochet-store', '--only', 'hosting,firestore:rules')
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}

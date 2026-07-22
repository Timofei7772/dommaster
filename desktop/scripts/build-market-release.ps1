[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$backendRoot = Join-Path $repoRoot 'backend'
$frontendRoot = Join-Path $repoRoot 'frontend'
$pythonExe = Join-Path $backendRoot 'venv\Scripts\python.exe'
$specPath = Join-Path $backendRoot 'dommaster-server.spec'
$verifyScript = Join-Path $PSScriptRoot 'verify-market-release.ps1'

# electron-builder consumes these variables without writing the certificate or
# its password into source files, command-line arguments, logs, or artifacts.
if ([string]::IsNullOrWhiteSpace($env:CSC_LINK) -or
    [string]::IsNullOrWhiteSpace($env:CSC_KEY_PASSWORD)) {
    throw 'Authenticode signing credentials are required: set CSC_LINK and CSC_KEY_PASSWORD.'
}

if (-not (Test-Path -LiteralPath $pythonExe -PathType Leaf)) {
    throw "Pinned backend Python environment was not found: $pythonExe"
}
if (-not (Test-Path -LiteralPath $specPath -PathType Leaf)) {
    throw "PyInstaller specification was not found: $specPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $desktopRoot 'package-lock.json') -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $frontendRoot 'package-lock.json') -PathType Leaf)) {
    throw 'Both frontend and desktop package-lock.json files are required for a market build.'
}

# A globally inherited value makes Electron run as plain Node and invalidates
# the desktop smoke test. A release build must be isolated from that state.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'true'

Push-Location $backendRoot
try {
    & $pythonExe -m PyInstaller --clean --noconfirm $specPath
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

Push-Location $frontendRoot
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "Frontend npm ci failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}

Push-Location $desktopRoot
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw "Desktop npm ci failed with exit code $LASTEXITCODE." }

    & npm run build:win
    if ($LASTEXITCODE -ne 0) { throw "Windows packaging failed with exit code $LASTEXITCODE." }

    & $verifyScript
    if ($LASTEXITCODE -ne 0) { throw "Market release verification failed with exit code $LASTEXITCODE." }
}
finally {
    Pop-Location
}


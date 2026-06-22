$ErrorActionPreference = 'Stop'

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = "dist\\build-$ts"

Write-Output "Output directory: $outDir"

# Build renderer first
npm run build:renderer
if ($LASTEXITCODE -ne 0) { throw "build:renderer failed with exit code $LASTEXITCODE" }

# Build EXE to a fresh output directory to avoid locked win-unpacked
npx electron-builder --win --config.directories.output=$outDir
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed with exit code $LASTEXITCODE" }

Write-Output "Build completed: $outDir"

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $desktopRoot
$packagePath = Join-Path $desktopRoot 'package.json'
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$distRoot = Join-Path $desktopRoot 'dist'
$installerName = "SmetaAI_Setup_$($package.version).exe"
$installerPath = Join-Path $distRoot $installerName
$appPath = Join-Path $distRoot 'win-unpacked\SmetaAI.exe'
$sourceBackendPath = Join-Path $repoRoot 'backend\dist\dommaster-server.exe'
$embeddedBackendPath = Join-Path $distRoot 'win-unpacked\resources\backend\dommaster-server.exe'
$shaSumsPath = Join-Path $distRoot 'SHA256SUMS'
$manifestPath = Join-Path $distRoot 'release-manifest.json'

foreach ($requiredPath in @($installerPath, $appPath, $sourceBackendPath, $embeddedBackendPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required release artifact is missing: $requiredPath"
    }
}

$installerSignature = Get-AuthenticodeSignature -LiteralPath $installerPath
if ($installerSignature.Status -ne 'Valid') {
    throw "Installer Authenticode signature is not valid: $($installerSignature.Status)."
}

$appSignature = Get-AuthenticodeSignature -LiteralPath $appPath
if ($appSignature.Status -ne 'Valid') {
    throw "Application Authenticode signature is not valid: $($appSignature.Status)."
}

$installerHash = Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath
$sourceBackendHash = Get-FileHash -Algorithm SHA256 -LiteralPath $sourceBackendPath
$embeddedBackendHash = Get-FileHash -Algorithm SHA256 -LiteralPath $embeddedBackendPath
if ($sourceBackendHash.Hash -ne $embeddedBackendHash.Hash) {
    throw 'Embedded backend hash differs from the verified backend build.'
}

$shaLines = @(
    "$($installerHash.Hash.ToLowerInvariant())  $installerName"
    "$($embeddedBackendHash.Hash.ToLowerInvariant())  dommaster-server.exe"
)
Set-Content -LiteralPath $shaSumsPath -Value $shaLines -Encoding ascii

$manifest = [ordered]@{
    product = 'SmetaAI'
    version = [string]$package.version
    generated_at_utc = [DateTime]::UtcNow.ToString('o')
    signing = [ordered]@{
        status = [string]$installerSignature.Status
        subject = [string]$installerSignature.SignerCertificate.Subject
        thumbprint = [string]$installerSignature.SignerCertificate.Thumbprint
    }
    artifacts = @(
        [ordered]@{
            file = $installerName
            sha256 = $installerHash.Hash.ToLowerInvariant()
            bytes = (Get-Item -LiteralPath $installerPath).Length
        }
        [ordered]@{
            file = 'dommaster-server.exe'
            sha256 = $embeddedBackendHash.Hash.ToLowerInvariant()
            bytes = (Get-Item -LiteralPath $embeddedBackendPath).Length
        }
    )
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8

Write-Output "Market release verified: $installerPath"
Write-Output "SHA-256 manifest: $shaSumsPath"
Write-Output "Release metadata: $manifestPath"

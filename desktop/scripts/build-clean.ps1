$ErrorActionPreference = 'Stop'

$winUnpacked = Join-Path $PSScriptRoot '..\dist\win-unpacked'

function Stop-LockingProcesses {
  # Kill processes running from this project's win-unpacked folder
  Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath -like "*\\SmetaAI\\desktop\\dist\\win-unpacked\\*"
  } | ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force } catch {}
  }

  # Fallback: kill processes whose name starts with ZARU
  Get-Process | Where-Object {
    $_.ProcessName -like 'ZARU*'
  } | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force } catch {}
  }
}

function Remove-With-Retry {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [int]$Retries = 5,
    [int]$DelaySeconds = 1
  )
  for ($i = 0; $i -lt $Retries; $i++) {
    try {
      if (Test-Path $Path) {
        Remove-Item -Path $Path -Recurse -Force -ErrorAction Stop
      }
      return $true
    } catch {
      Start-Sleep -Seconds $DelaySeconds
      Stop-LockingProcesses
    }
  }
  return $false
}

# Close running app to unlock app.asar (ASCII-only match to avoid encoding issues)
Stop-LockingProcesses
Start-Sleep -Seconds 1

if (Test-Path $winUnpacked) {
  $removed = Remove-With-Retry -Path $winUnpacked -Retries 6 -DelaySeconds 1
  if (-not $removed) {
    throw "Failed to delete $winUnpacked. app.asar is locked by another process. Close the app and retry."
  }
}

Write-Output 'cleaned'

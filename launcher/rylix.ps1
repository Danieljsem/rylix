# Starts Rylix: the local server (hidden, only if not running yet), then an app window.
# Used by the desktop shortcut until the Electron build replaces it.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$url = 'http://127.0.0.1:3000'

function Test-Rylix {
  try { (Invoke-WebRequest -Uri "$url/api/status" -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
}

if (-not (Test-Rylix)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
  Start-Process -FilePath $node -ArgumentList '--env-file-if-exists=.env', 'src\server.js' `
    -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 40 -and -not (Test-Rylix); $i++) { Start-Sleep -Milliseconds 250 }
}

# App window without browser UI (Edge is part of Windows); plain browser as a fallback.
$edge = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
  Start-Process -FilePath $edge -ArgumentList "--app=$url", '--window-size=1440,900'
} else {
  Start-Process $url
}

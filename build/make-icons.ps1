# Builds the app icons from build/icon.svg (Windows only):
#   headless Edge renders the SVG at 512 px with a transparent background,
#   System.Drawing scales it to public/icons/icon-<size>.png, make-ico.mjs packs build/icon.ico.
# Run: npm run icons
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$edge = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }

$big = Join-Path $env:TEMP 'rylix-icon-512.png'
$profile = Join-Path $env:TEMP 'rylix-icon-edge'
$svgUrl = ([Uri](Join-Path $root 'build\icon.svg')).AbsoluteUri
# Edge reports "N bytes written" on stderr, which PowerShell 5 would treat as an error.
$ErrorActionPreference = 'Continue'
& $edge --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" `
  --default-background-color=00000000 --window-size=512,512 --screenshot="$big" $svgUrl 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
for ($i = 0; $i -lt 40 -and -not (Test-Path $big); $i++) { Start-Sleep -Milliseconds 250 }

$src = [System.Drawing.Image]::FromFile($big)
foreach ($size in 16, 32, 48, 180, 256, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($src, 0, 0, $size, $size)
  $g.Dispose()
  $bmp.Save((Join-Path $root "public\icons\icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$src.Dispose()
Remove-Item $big, $profile -Recurse -Force -ErrorAction SilentlyContinue
& node (Join-Path $root 'build\make-ico.mjs')

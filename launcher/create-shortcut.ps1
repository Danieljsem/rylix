# Creates "Rylix" on the desktop (and in the Start menu) with the app icon.
# Opens the desktop app (Electron); launcher/rylix.ps1 remains as the browser-only fallback.
$root = Split-Path -Parent $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Rylix.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Rylix.lnk')
)
foreach ($path in $targets) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = Join-Path $root 'node_modules\electron\dist\electron.exe'
  $lnk.Arguments = "`"$root`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$root\build\icon.ico,0"
  $lnk.Description = 'Rylix – texty písní a romanizace'
  $lnk.WindowStyle = 1
  $lnk.Save()
  "created: $path"
}

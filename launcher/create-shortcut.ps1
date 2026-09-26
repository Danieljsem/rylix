# Creates "Rylix" on the desktop (and in the Start menu) with the app icon.
$root = Split-Path -Parent $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Rylix.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Rylix.lnk')
)
foreach ($path in $targets) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\launcher\rylix.ps1`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$root\build\icon.ico,0"
  $lnk.Description = 'Rylix – texty písní a romanizace'
  $lnk.WindowStyle = 7
  $lnk.Save()
  "created: $path"
}

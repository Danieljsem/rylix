# Sends one media command to the current Windows media session (Spotify, browser, …),
# the same thing the media keys / volume flyout do. Prints "true" or "false".
param(
  [Parameter(Mandatory = $true)][ValidateSet('toggle', 'next', 'prev', 'seek')][string]$Action,
  [long]$PositionMs = 0,
  [string]$App = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$Manager = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = Await ($Manager::RequestAsync()) ($Manager)
# Control the player the UI is synced with (by app id); otherwise the one that is playing.
$sessions = @($mgr.GetSessions())
$s = $null
if ($App) { $s = $sessions | Where-Object { $_.SourceAppUserModelId -eq $App } | Select-Object -First 1 }
if (-not $s) { $s = $sessions | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing' } | Select-Object -First 1 }
if (-not $s) { $s = $mgr.GetCurrentSession() }
if (-not $s) { [Console]::Out.WriteLine('false'); exit 0 }
switch ($Action) {
  'toggle' { $ok = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
  'next'   { $ok = Await ($s.TrySkipNextAsync()) ([bool]) }
  'prev'   { $ok = Await ($s.TrySkipPreviousAsync()) ([bool]) }
  'seek'   { $ok = Await ($s.TryChangePlaybackPositionAsync([long]$PositionMs * 10000)) ([bool]) }
}
[Console]::Out.WriteLine("$ok".ToLower())

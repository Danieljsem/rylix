# Prints what Windows is playing (Spotify, browsers, media players) as one JSON line
# about every 700 ms. Source: Windows media session API (the volume flyout's data).
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
$Props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ($Manager::RequestAsync()) ($Manager)

function Now-Ms { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }

while ($true) {
  try {
    # Whatever is actually playing wins (a paused Spotify must not hide YouTube in a browser);
    # Windows' own "current" session only breaks ties or stands in when nothing plays.
    $sessions = @($mgr.GetSessions())
    $current = $mgr.GetCurrentSession()
    $playing = @($sessions | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing' })
    if ($current -and "$($current.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing') { $session = $current }
    elseif ($playing.Count -gt 0) { $session = $playing[0] }
    elseif ($current) { $session = $current }
    else { $session = $sessions | Select-Object -First 1 }
    if ($session) {
      $p = Await ($session.TryGetMediaPropertiesAsync()) ($Props)
      $tl = $session.GetTimelineProperties()
      $status = "$($session.GetPlaybackInfo().PlaybackStatus)"
      $pos = $tl.Position.TotalMilliseconds
      # Players report the position only on changes; extrapolate while playing.
      if ($status -eq 'Playing' -and $tl.LastUpdatedTime.Year -gt 2000) {
        $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalMilliseconds
      }
      $end = $tl.EndTime.TotalMilliseconds
      if ($end -gt 0 -and $pos -gt $end) { $pos = $end }
      $out = [ordered]@{
        status = $status
        app = $session.SourceAppUserModelId
        artist = $p.Artist
        title = $p.Title
        album = $p.AlbumTitle
        positionMs = [math]::Round($pos)
        durationMs = [math]::Round($end)
        sampledAt = Now-Ms
      }
    } else {
      $out = [ordered]@{ status = 'None'; sampledAt = Now-Ms }
    }
    [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
  } catch {
    [Console]::Out.WriteLine(([ordered]@{ status = 'Error'; error = "$($_.Exception.Message)"; sampledAt = Now-Ms } | ConvertTo-Json -Compress))
  }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 700
}

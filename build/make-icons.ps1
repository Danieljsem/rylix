Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Image]::FromFile("$root\build\icon-source.png")
# Rounded square inside the artwork; everything outside it becomes transparent.
$x = 100; $y = 108; $w = 1055; $h = 1034; $r = 230
$masked = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($masked)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$d = 2 * $r
$path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($w - $d, 0, $d, $d, 270, 90)
$path.AddArc($w - $d, $h - $d, $d, $d, 0, 90); $path.AddArc(0, $h - $d, $d, $d, 90, 90); $path.CloseFigure()
$brush = New-Object System.Drawing.TextureBrush($src, (New-Object System.Drawing.Rectangle $x, $y, $w, $h))
$g.FillPath($brush, $path)
$g.Dispose()
foreach ($size in 16, 32, 48, 180, 256, 512) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $gg = [System.Drawing.Graphics]::FromImage($bmp)
  $gg.InterpolationMode = 'HighQualityBicubic'; $gg.SmoothingMode = 'AntiAlias'; $gg.PixelOffsetMode = 'HighQuality'
  $gg.DrawImage($masked, 0, 0, $size, $size)
  $gg.Dispose()
  $bmp.Save("$root\public\icons\icon-$size.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
'done'

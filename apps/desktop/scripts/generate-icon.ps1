# Cmail icon generator
# Creates PNGs at multiple sizes + a multi-resolution ICO file.
# Design: purple gradient rounded square with white envelope (UI-matching).

Add-Type -AssemblyName System.Drawing

$OutDir   = Join-Path $PSScriptRoot "..\public\icons" | Resolve-Path
$IcoPath  = Join-Path $OutDir "cmail.ico"
$PngLarge = Join-Path $OutDir "cmail-256.png"

# Sizes to embed in the ICO (and store as PNGs)
$Sizes = @(16, 32, 48, 64, 128, 256)

function New-CmailBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # --- Rounded square background with vertical purple gradient ---
    $radius = [Math]::Round($size * 0.22)
    $inset  = [Math]::Max(1, [int]($size * 0.04))  # subtle margin
    $rect   = New-Object System.Drawing.RectangleF($inset, $inset, ($size - 2 * $inset), ($size - 2 * $inset))

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($rect.X,                $rect.Y,                  $d, $d, 180, 90) | Out-Null
    $path.AddArc($rect.Right - $d,       $rect.Y,                  $d, $d, 270, 90) | Out-Null
    $path.AddArc($rect.Right - $d,       $rect.Bottom - $d,        $d, $d,   0, 90) | Out-Null
    $path.AddArc($rect.X,                $rect.Bottom - $d,        $d, $d,  90, 90) | Out-Null
    $path.CloseFigure()

    $top    = [System.Drawing.Color]::FromArgb(255, 139,  92, 246)  # violet-500
    $bottom = [System.Drawing.Color]::FromArgb(255, 109,  40, 217)  # violet-700
    $brush  = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
                  $rect, $top, $bottom, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $g.FillPath($brush, $path)

    # --- White envelope (matches the existing header logo style) ---
    # Reference proportions taken from the 24x24 SVG used in Sidebar:
    #   envelope x=2..22, y=4..20  (i.e. width 20, height 16  → ratio 5:4)
    #   flap V goes from (2,6) → (12,11) → (22,6)
    # Scale that into ~60% of the icon size, centered.
    $envW    = $size * 0.56
    $envH    = $envW * 0.74     # slightly less than 4:3 to look balanced
    $envX    = ($size - $envW) / 2
    $envY    = ($size - $envH) / 2 + $size * 0.02   # nudge down a touch
    $envR    = $envW * 0.10                          # corner radius for envelope
    $stroke  = [Math]::Max(1.0, $size * 0.04)        # flap line thickness

    # Envelope rounded body
    $envRect = New-Object System.Drawing.RectangleF($envX, $envY, $envW, $envH)
    $envPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $ed = $envR * 2
    $envPath.AddArc($envRect.X,              $envRect.Y,                 $ed, $ed, 180, 90) | Out-Null
    $envPath.AddArc($envRect.Right - $ed,    $envRect.Y,                 $ed, $ed, 270, 90) | Out-Null
    $envPath.AddArc($envRect.Right - $ed,    $envRect.Bottom - $ed,      $ed, $ed,   0, 90) | Out-Null
    $envPath.AddArc($envRect.X,              $envRect.Bottom - $ed,      $ed, $ed,  90, 90) | Out-Null
    $envPath.CloseFigure()

    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillPath($white, $envPath)

    # Flap "V": draw two purple lines from top corners down to mid-top
    $flapTopY = $envY + $envH * 0.14   # how far down from envelope top the flap line starts
    $flapApexY = $envY + $envH * 0.55  # how deep the V dips
    $apexX     = $envX + $envW / 2

    $flapColor = [System.Drawing.Color]::FromArgb(255, 109, 40, 217)
    $pen = New-Object System.Drawing.Pen($flapColor, [float]$stroke)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $g.DrawLine($pen, [float]($envX + $envW * 0.05), [float]$flapTopY, [float]$apexX, [float]$flapApexY)
    $g.DrawLine($pen, [float]($envX + $envW * 0.95), [float]$flapTopY, [float]$apexX, [float]$flapApexY)

    # Cleanup
    $pen.Dispose()
    $white.Dispose()
    $envPath.Dispose()
    $brush.Dispose()
    $path.Dispose()
    $g.Dispose()
    return $bmp
}

# Generate all PNGs
$pngBytes = @{}
foreach ($s in $Sizes) {
    $bmp = New-CmailBitmap $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes[$s] = $ms.ToArray()
    $bmp.Save((Join-Path $OutDir ("cmail-{0}.png" -f $s)), [System.Drawing.Imaging.ImageFormat]::Png)
    $ms.Dispose()
    $bmp.Dispose()
}

# --- Build multi-resolution ICO (PNG-encoded entries; supported by Windows Vista+) ---
$icoStream = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($icoStream)

# ICONDIR header
$bw.Write([UInt16]0)                # reserved
$bw.Write([UInt16]1)                # type = icon
$bw.Write([UInt16]$Sizes.Count)     # image count

# Compute offset where image data begins (after directory)
$dataOffset = 6 + (16 * $Sizes.Count)

# ICONDIRENTRY for each size
foreach ($s in $Sizes) {
    $bytes = $pngBytes[$s]
    $w = if ($s -ge 256) { 0 } else { [byte]$s }   # 0 means 256
    $h = $w
    $bw.Write([byte]$w)             # width
    $bw.Write([byte]$h)             # height
    $bw.Write([byte]0)              # color palette (0 = no palette)
    $bw.Write([byte]0)              # reserved
    $bw.Write([UInt16]1)            # color planes
    $bw.Write([UInt16]32)           # bits per pixel
    $bw.Write([UInt32]$bytes.Length) # size of image data
    $bw.Write([UInt32]$dataOffset)  # offset to image data
    $dataOffset += $bytes.Length
}

# Image data
foreach ($s in $Sizes) {
    $bw.Write($pngBytes[$s])
}

$bw.Flush()
[System.IO.File]::WriteAllBytes($IcoPath, $icoStream.ToArray())
$bw.Dispose()
$icoStream.Dispose()

Write-Output ("ICO written: {0} ({1} bytes)" -f $IcoPath, (Get-Item $IcoPath).Length)
foreach ($s in $Sizes) {
    $p = Join-Path $OutDir ("cmail-{0}.png" -f $s)
    Write-Output ("PNG: {0} ({1} bytes)" -f $p, (Get-Item $p).Length)
}

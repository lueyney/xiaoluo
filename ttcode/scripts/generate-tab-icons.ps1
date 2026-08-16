Add-Type -AssemblyName System.Drawing

function Get-Color {
    param(
        [int]$R,
        [int]$G,
        [int]$B
    )
    return [System.Drawing.Color]::FromArgb(255, $R, $G, $B)
}

function Add-RoundedRect {
    param(
        [System.Drawing.Drawing2D.GraphicsPath]$Path,
        [System.Drawing.RectangleF]$Rect,
        [double]$Radius
    )

    $diameter = $Radius * 2
    $Path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
    $Path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
    $Path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $Path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $Path.CloseFigure()
}

function New-TabIcon {
    param(
        [string]$Path,
        [string]$Kind,
        [System.Drawing.Color]$BaseColor,
        [System.Drawing.Color]$AccentColor
    )

    $size = 128
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 255, 255, 255))

    $panelRect = [System.Drawing.RectangleF]::new(12, 12, 104, 104)
    $panelPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect -Path $panelPath -Rect $panelRect -Radius 22
    $panelBrush = New-Object System.Drawing.SolidBrush($BaseColor)
    $g.FillPath($panelBrush, $panelPath)
    $panelBrush.Dispose()

    $pen = New-Object System.Drawing.Pen($AccentColor, 10)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $brush = New-Object System.Drawing.SolidBrush($AccentColor)

    switch ($Kind) {
        'writing' {
            $g.DrawLine($pen, 36, 88, 92, 40)
            $points = @(
                [System.Drawing.PointF]::new(84, 46),
                [System.Drawing.PointF]::new(104, 30),
                [System.Drawing.PointF]::new(112, 40),
                [System.Drawing.PointF]::new(94, 56)
            )
            $g.FillPolygon($brush, $points)
            $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, $AccentColor.R, $AccentColor.G, $AccentColor.B))
            $g.FillEllipse($shadow, 34, 90, 30, 12)
            $shadow.Dispose()
        }
        'library' {
            $tab = @(
                [System.Drawing.PointF]::new(30, 52),
                [System.Drawing.PointF]::new(48, 34),
                [System.Drawing.PointF]::new(96, 34),
                [System.Drawing.PointF]::new(96, 56),
                [System.Drawing.PointF]::new(30, 56)
            )
            $g.FillPolygon($brush, $tab)
            $bodyRect = [System.Drawing.RectangleF]::new(26, 54, 76, 42)
            $bodyPath = New-Object System.Drawing.Drawing2D.GraphicsPath
            Add-RoundedRect -Path $bodyPath -Rect $bodyRect -Radius 12
            $g.FillPath($brush, $bodyPath)
        }
        'rewrite' {
            $pen.Width = 12
            $g.DrawArc($pen, 30, 32, 68, 68, 210, 220)
            $arrow1 = @(
                [System.Drawing.PointF]::new(30, 68),
                [System.Drawing.PointF]::new(26, 88),
                [System.Drawing.PointF]::new(48, 82)
            )
            $g.FillPolygon($brush, $arrow1)
            $g.DrawArc($pen, 32, 30, 68, 68, 30, 220)
            $arrow2 = @(
                [System.Drawing.PointF]::new(100, 58),
                [System.Drawing.PointF]::new(104, 38),
                [System.Drawing.PointF]::new(82, 44)
            )
            $g.FillPolygon($brush, $arrow2)
        }
        'orders' {
            $cardRect = [System.Drawing.RectangleF]::new(32, 36, 64, 56)
            $cardPath = New-Object System.Drawing.Drawing2D.GraphicsPath
            Add-RoundedRect -Path $cardPath -Rect $cardRect -Radius 14
            $g.DrawPath($pen, $cardPath)
            $g.DrawLine($pen, 32, 54, 96, 54)
            $g.DrawLine($pen, 44, 74, 84, 74)
        }
        'profile' {
            $g.DrawEllipse($pen, 48, 30, 32, 32)
            $g.DrawArc($pen, 36, 60, 56, 46, 210, 120)
        }
    }

    $pen.Dispose()
    $brush.Dispose()
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$inactiveBase = Get-Color 236 240 248
$activeBase = Get-Color 229 239 255
$inactiveAccent = Get-Color 71 85 105
$activeAccent = Get-Color 37 99 235

New-TabIcon -Path 'assets/tab-writing.png' -Kind 'writing' -BaseColor $inactiveBase -AccentColor $inactiveAccent
New-TabIcon -Path 'assets/tab-writing-active.png' -Kind 'writing' -BaseColor $activeBase -AccentColor $activeAccent
New-TabIcon -Path 'assets/tab-library.png' -Kind 'library' -BaseColor $inactiveBase -AccentColor $inactiveAccent
New-TabIcon -Path 'assets/tab-library-active.png' -Kind 'library' -BaseColor $activeBase -AccentColor $activeAccent
New-TabIcon -Path 'assets/tab-rewrite.png' -Kind 'rewrite' -BaseColor $inactiveBase -AccentColor $inactiveAccent
New-TabIcon -Path 'assets/tab-rewrite-active.png' -Kind 'rewrite' -BaseColor $activeBase -AccentColor $activeAccent
New-TabIcon -Path 'assets/tab-orders.png' -Kind 'orders' -BaseColor $inactiveBase -AccentColor $inactiveAccent
New-TabIcon -Path 'assets/tab-orders-active.png' -Kind 'orders' -BaseColor $activeBase -AccentColor $activeAccent
New-TabIcon -Path 'assets/tab-profile.png' -Kind 'profile' -BaseColor $inactiveBase -AccentColor $inactiveAccent
New-TabIcon -Path 'assets/tab-profile-active.png' -Kind 'profile' -BaseColor $activeBase -AccentColor $activeAccent


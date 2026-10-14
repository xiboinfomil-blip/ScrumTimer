# Office-free PPTX GIF extraction; Windows PowerShell 5.1.
function Set-GifInfiniteLoop {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path, [string]$OutputPath = $Path)
    [byte[]]$bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 14 -or [Text.Encoding]::ASCII.GetString($bytes,0,6) -notin 'GIF87a','GIF89a') { throw "Invalid GIF: $Path" }
    $position = 13
    if ($bytes[10] -band 128) { $position += 3 * [Math]::Pow(2,(($bytes[10] -band 7)+1)) }
    if ($position -ge $bytes.Length) { throw 'Truncated GIF color table.' }
    $result = New-Object 'System.Collections.Generic.List[byte]'
    $result.AddRange([byte[]]$bytes[0..($position-1)])
    $result[4] = 57 # GIF89a
    $result.AddRange([byte[]]@(33,255,11,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0))
    $frames = 0; $ended = $false
    while ($position -lt $bytes.Length) {
        $start = $position; $marker = $bytes[$position++]; $remove = $false
        if ($marker -eq 59) {
            if ($position -ne $bytes.Length) { throw 'Unexpected data after GIF trailer.' }
            $result.Add(59); $ended = $true; break
        } elseif ($marker -eq 44) {
            if ($position+9 -gt $bytes.Length) { throw 'Truncated GIF descriptor.' }
            $packed = $bytes[$position+8]; $position += 9
            if ($packed -band 128) { $position += 3 * [Math]::Pow(2,(($packed -band 7)+1)) }
            if ($position -ge $bytes.Length) { throw 'Truncated GIF image data.' }
            $position++; $frames++ # LZW code size precedes image sub-blocks.
        } elseif ($marker -eq 33) {
            if ($position -ge $bytes.Length) { throw 'Truncated GIF extension.' }
            $label = $bytes[$position++]
            if ($label -eq 255) {
                if ($position -ge $bytes.Length) { throw 'Truncated application extension.' }
                $length = $bytes[$position]
                if ($position+1+$length -gt $bytes.Length) { throw 'Truncated application identifier.' }
                if ($length -eq 11) { $remove = [Text.Encoding]::ASCII.GetString($bytes,$position+1,11) -in 'NETSCAPE2.0','ANIMEXTS1.0' }
            }
        } else { throw "Invalid GIF marker $marker at $start." }
        # Walk blocks, never search image payloads for NETSCAPE signatures.
        do {
            if ($position -ge $bytes.Length) { throw 'Truncated GIF sub-block.' }
            $length = [int]$bytes[$position++]
            if ($position+$length -gt $bytes.Length) { throw 'Truncated GIF payload.' }
            $position += $length
        } while ($length -ne 0)
        if (!$remove) { $result.AddRange([byte[]]$bytes[$start..($position-1)]) }
    }
    if (!$ended -or !$frames) { throw 'GIF has no complete image/trailer.' }
    [IO.File]::WriteAllBytes($OutputPath,$result.ToArray())
    [pscustomobject]@{ path = $OutputPath; width = [int]$bytes[6]+256*[int]$bytes[7]; height = [int]$bytes[8]+256*[int]$bytes[9]; frames = $frames; loopCount = 0 }
}

function Export-MoodGifAssets {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][string]$OutputFolder)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $file = Get-Item -LiteralPath $Path
    if ($file.Extension -ine '.pptx') { throw 'Office-free extraction requires .pptx.' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $id = 'deck-' + ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($file.Name.ToLowerInvariant()))).Replace('-','').Substring(0,20).ToLowerInvariant()) } finally { $sha.Dispose() }
    $folder = [IO.Path]::GetFullPath($OutputFolder)
    [void][IO.Directory]::CreateDirectory($folder)
    $warnings = New-Object 'System.Collections.Generic.List[string]'
    $zip = [IO.Compression.ZipFile]::OpenRead($file.FullName)
    try {
        function Read-Part([string]$name) {
            $entry = $zip.GetEntry($name)
            if (!$entry) { throw "Missing PPTX part: $name" }
            $reader = New-Object IO.StreamReader($entry.Open())
            try {
                $doc = New-Object Xml.XmlDocument; $doc.XmlResolver = $null
                $settings = New-Object Xml.XmlReaderSettings; $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
                $xmlReader = [Xml.XmlReader]::Create($reader,$settings)
                try { $doc.Load($xmlReader) } finally { $xmlReader.Dispose() }
                return ,$doc
            } finally { $reader.Dispose() }
        }
        function Relations([string]$part) {
            $directory = $part.Substring(0,$part.LastIndexOf('/')+1); $name = $part.Substring($part.LastIndexOf('/')+1)
            $map = @{}
            if ($zip.GetEntry("${directory}_rels/$name.rels")) {
                $xml = Read-Part "${directory}_rels/$name.rels"
                foreach ($rel in $xml.DocumentElement.ChildNodes) {
                    if ($rel.TargetMode -eq 'External') { continue }
                    $base = New-Object Uri("http://pptx/$part")
                    $uri = New-Object Uri($base,[string]$rel.Target)
                    if ($uri.Host -ne 'pptx') { throw 'External relationship not supported.' }
                    $map[[string]$rel.Id] = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
                }
            }
            return $map
        }
        function Multiply($a,$b) {
            return ,@(($a[0]*$b[0]+$a[2]*$b[1]),($a[1]*$b[0]+$a[3]*$b[1]),($a[0]*$b[2]+$a[2]*$b[3]),($a[1]*$b[2]+$a[3]*$b[3]),($a[0]*$b[4]+$a[2]*$b[5]+$a[4]),($a[1]*$b[4]+$a[3]*$b[5]+$a[5]))
        }
        function Number($node,[string]$attribute,[double]$default = 0) {
            if ($node -and $node.HasAttribute($attribute)) { return [double]::Parse($node.GetAttribute($attribute),[Globalization.CultureInfo]::InvariantCulture) }
            return $default
        }
        function Shape-Matrix($transform,[bool]$group) {
            $off = $transform.SelectSingleNode("*[local-name()='off']"); $ext = $transform.SelectSingleNode("*[local-name()='ext']")
            $x = Number $off 'x'; $y = Number $off 'y'; $w = Number $ext 'cx'; $h = Number $ext 'cy'
            if ($w -le 0 -or $h -le 0) { throw 'Invalid shape extent.' }
            $angle = (Number $transform 'rot')/60000*[Math]::PI/180
            $cos = [Math]::Cos($angle); $sin = [Math]::Sin($angle); $fx = 1; $fy = 1
            if ($transform.GetAttribute('flipH') -in '1','true') { $fx = -1 }
            if ($transform.GetAttribute('flipV') -in '1','true') { $fy = -1 }
            $orientation = @(($cos*$fx),($sin*$fx),(-$sin*$fy),($cos*$fy),($x+$w/2),($y+$h/2))
            if ($group) {
                $co = $transform.SelectSingleNode("*[local-name()='chOff']"); $ce = $transform.SelectSingleNode("*[local-name()='chExt']")
                $cw = Number $ce 'cx'; $ch = Number $ce 'cy'
                if ($cw -le 0 -or $ch -le 0) { throw 'Invalid child extent.' }
                $sx = $w/$cw; $sy = $h/$ch
                $local = @($sx,0,0,$sy,(-$w/2-$sx*(Number $co 'x')),(-$h/2-$sy*(Number $co 'y')))
            } else { $local = @($w,0,0,$h,(-$w/2),(-$h/2)) }
            return ,(Multiply $orientation $local)
        }
        $presentation = Read-Part 'ppt/presentation.xml'
        $size = $presentation.SelectSingleNode("/*[local-name()='presentation']/*[local-name()='sldSz']")
        $sw = Number $size 'cx'; $sh = Number $size 'cy'
        if ($sw -le 0 -or $sh -le 0) { throw 'Invalid slide size.' }
        $media = @{}
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -notmatch '^ppt/media/[^/]+$') { continue }
            $stream = $entry.Open()
            try {
                $signature = New-Object byte[] 6; $count = $stream.Read($signature,0,6)
                if ($count -ne 6 -or [Text.Encoding]::ASCII.GetString($signature) -notin 'GIF87a','GIF89a') { continue }
            } finally { $stream.Dispose() }
            $name = ('gif-' + $entry.Name -replace '[^\w.-]','_') + '.gif'
            $destination = Join-Path $folder $name
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$true)
            $info = Set-GifInfiniteLoop -Path $destination
            $media[$entry.FullName] = [pscustomobject]@{ media = $entry.FullName; src = $name; width = $info.width; height = $info.height; frames = $info.frames; loopCount = 0 }
        }
        $slides = New-Object 'System.Collections.Generic.List[object]'
        $presentationRels = Relations 'ppt/presentation.xml'; $number = 0
        foreach ($slideId in $presentation.SelectNodes("/*[local-name()='presentation']/*[local-name()='sldIdLst']/*[local-name()='sldId']")) {
            $number++
            $rid = $slideId.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            $part = $presentationRels[$rid]
            if (!$part) { throw "Missing slide relationship: $number" }
            $xml = Read-Part $part; $rels = Relations $part
            $overlays = New-Object 'System.Collections.Generic.List[object]'
            function Visit-Shapes($parent,$matrix) {
                foreach ($shape in $parent.ChildNodes) {
                    if ($shape.LocalName -eq 'grpSp') {
                        $transform = $shape.SelectSingleNode("*[local-name()='grpSpPr']/*[local-name()='xfrm']")
                        if (!$transform) { throw 'Group has no transform.' }
                        Visit-Shapes $shape (Multiply $matrix (Shape-Matrix $transform $true))
                    } elseif ($shape.LocalName -eq 'pic') {
                        $blip = $shape.SelectSingleNode("*[local-name()='blipFill']/*[local-name()='blip']")
                        if (!$blip) { continue }
                        $target = $rels[$blip.GetAttribute('embed','http://schemas.openxmlformats.org/officeDocument/2006/relationships')]
                        if (!$target -or !$media.ContainsKey($target)) { continue }
                        $transform = $shape.SelectSingleNode("*[local-name()='spPr']/*[local-name()='xfrm']")
                        if (!$transform) { $warnings.Add("Slide ${number}: inherited picture transform unsupported ($target); PNG retained."); continue }
                        $m = Multiply $matrix (Shape-Matrix $transform $false)
                        $crop = $shape.SelectSingleNode("*[local-name()='blipFill']/*[local-name()='srcRect']")
                        $l = (Number $crop 'l')/100000; $t = (Number $crop 't')/100000; $r = (Number $crop 'r')/100000; $b = (Number $crop 'b')/100000
                        if ($l+$r -ge 1 -or $t+$b -ge 1) { throw 'Invalid crop.' }
                        $overlays.Add([pscustomobject]@{
                            src = $media[$target].src; media = $target; x = $m[4]/$sw; y = $m[5]/$sh
                            width = [Math]::Sqrt($m[0]*$m[0]+$m[1]*$m[1])/$sw; height = [Math]::Sqrt($m[2]*$m[2]+$m[3]*$m[3])/$sh
                            transform = @(($m[0]/$sw),($m[1]/$sh),($m[2]/$sw),($m[3]/$sh),($m[4]/$sw),($m[5]/$sh))
                            crop = [pscustomobject]@{ left = $l; top = $t; right = $r; bottom = $b }
                        })
                    }
                }
            }
            Visit-Shapes ($xml.SelectSingleNode("/*[local-name()='sld']/*[local-name()='cSld']/*[local-name()='spTree']")) @(1,0,0,1,0,0)
            $slides.Add([pscustomobject]@{ number = $number; part = $part; overlays = @($overlays.ToArray()) })
        }
        $metadata = [pscustomobject]@{
            schemaVersion = 1; id = $id; source = $file.Name; title = $file.BaseName
            slideWidth = $sw; slideHeight = $sh; aspectRatio = $sw/$sh
            media = @($media.Values | Sort-Object media); slides = @($slides.ToArray()); warnings = @($warnings.ToArray())
        }
        [IO.File]::WriteAllText((Join-Path $folder 'gif-assets.json'),(ConvertTo-Json -InputObject $metadata -Depth 12),(New-Object Text.UTF8Encoding($false)))
        return $metadata
    } finally { $zip.Dispose() }
}
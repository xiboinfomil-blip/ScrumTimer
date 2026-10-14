[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SourceFolder = (Join-Path $PSScriptRoot '..\mood-meters\powerpoints'),
    [switch]$SkipPowerPoint,
    [ValidateRange(1,8)][int]$Concurrency = 4
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$sourceItem = Get-Item -LiteralPath $SourceFolder
if (!$sourceItem.PSIsContainer -or $sourceItem.PSProvider.Name -ne 'FileSystem') { throw 'SourceFolder must be a filesystem directory.' }
$source = $sourceItem.FullName
$meters = Join-Path $root 'mood-meters'
$slidesRoot = Join-Path $meters 'slides'
$catalogPath = Join-Path $meters 'catalog.js'
$reportPath = Join-Path $meters 'export-report.csv'
$helper = Join-Path $PSScriptRoot 'gif-mood-assets.ps1'

function Test-Within([string]$Path, [string]$Parent) {
    $p = [IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $base = [IO.Path]::GetFullPath($Parent).TrimEnd('\','/')
    return $p.Equals($base,[StringComparison]::OrdinalIgnoreCase) -or $p.StartsWith($base + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)
}
function Assert-NoReparse([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse points are not allowed: $current" }
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
function Get-DeckId([string]$Name) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return 'deck-' + ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Name.ToLowerInvariant()))).Replace('-','').Substring(0,20).ToLowerInvariant()) }
    finally { $sha.Dispose() }
}
function Write-Catalog($Decks) {
    $json = ConvertTo-Json -InputObject @($Decks) -Depth 16
    [IO.File]::WriteAllText($catalogPath,"// Generated PowerPoint slide catalogue.`r`nwindow.MOOD_METER_DECKS = $json;`r`n",(New-Object Text.UTF8Encoding($false)))
}

# Validate before opening Office, creating temporary files, or deleting anything.
if ((Test-Within $source $slidesRoot) -or (Test-Within $slidesRoot $source)) { throw 'SourceFolder must not overlap the generated slides directory.' }
foreach ($path in @($source,$slidesRoot,$catalogPath,$reportPath,$helper,(Join-Path $meters '.export.lock'))) { Assert-NoReparse $path }
if (!(Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'Missing GIF extraction helper.' }
$files = @(Get-ChildItem -LiteralPath $source -File | Where-Object { $_.Extension -in '.ppt','.pptx' } | Sort-Object Name)
if (!$files.Count) { throw 'Aucun fichier .ppt ou .pptx trouvé. Aucun fichier généré ne sera supprimé.' }
$seen = @{}
$items = @(foreach ($file in $files) {
    Assert-NoReparse $file.FullName
    $id = Get-DeckId $file.Name
    if ($seen.ContainsKey($id)) { throw "Duplicate deck ID: $($file.Name)" }
    $seen[$id] = $true
    [pscustomobject]@{ file = $file; id = $id }
})
if (!$PSCmdlet.ShouldProcess($slidesRoot,"Delete ALL generated slides and rebuild $($files.Count) decks, catalog and export report (workers: $Concurrency; SkipPowerPoint: $SkipPowerPoint)")) { return }

$lock = $null; $app = $null; $quitApp = $false; $pool = $null; $staging = $null; $renderGate = $null
$jobs = New-Object 'System.Collections.Generic.List[object]'
$results = New-Object 'System.Collections.Generic.List[object]'
$prior = @()
$worker = {
    param($File,$DeckId,$SlidesRoot,$WorkRoot,$CacheRoot,$Prior,$Helper,$RenderGate,$Skip)
    $ErrorActionPreference = 'Stop'
    . $Helper
    $work = Join-Path $WorkRoot $DeckId
    $output = Join-Path $SlidesRoot $DeckId
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        [void][IO.Directory]::CreateDirectory($work)
        $assets = $null
        if ($File.Extension -ieq '.pptx') {
            $assets = Export-MoodGifAssets -Path $File.FullName -OutputFolder $work
            if ($assets.id -ne $DeckId) { throw 'Unexpected GIF asset deck ID.' }
        }
        if (!$Skip) {
            # PowerPoint.Application may be the SAME COM server in every worker.
            # Only native rendering is serialized; extraction and file generation are parallel.
            $RenderGate.Wait()
            $native = $null; $presentations = $null; $presentation = $null; $page = $null; $slideCollection = $null
            try {
                $native = New-Object -ComObject PowerPoint.Application
                $presentations = $native.Presentations
                $presentation = $presentations.Open($File.FullName,-1,0,0)
                $page = $presentation.PageSetup
                $aspect = $page.SlideWidth / $page.SlideHeight
                $slideCollection = $presentation.Slides
                $count = $slideCollection.Count
                if ($count -lt 1 -or $aspect -le 0) { throw 'Invalid PowerPoint slide count/size.' }
                if ($assets -and $assets.slides.Count -ne $count) { throw 'PowerPoint/XML slide counts disagree.' }
                for ($n = 1; $n -le $count; $n++) {
                    $slide = $null
                    try {
                        $slide = $slideCollection.Item($n)
                        $slide.Export((Join-Path $work ('slide-{0:D3}.png' -f $n)),'PNG',1600,[Math]::Round(1600/$aspect))
                    } finally { if ($slide) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($slide) } }
                }
            } finally {
                try { if ($presentation) { $presentation.Close() } }
                finally {
                    try {
                        foreach ($com in @($slideCollection,$page,$presentation,$presentations,$native)) {
                            if ($com) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($com) }
                        }
                        # NEVER Quit in a worker: the main thread owns the application's lifetime.
                    } finally { [void]$RenderGate.Release() }
                }
            }
        } else {
            if (!$assets) { throw '-SkipPowerPoint requires .pptx sources.' }
            $count = $assets.slides.Count; $aspect = $assets.aspectRatio
            if ($count -lt 1) { throw 'No slides in PPTX.' }
            $oldDeck = @($Prior | Where-Object { $_.id -eq $DeckId -or $_.source -eq $File.Name -or $_.title -eq $File.BaseName })
            for ($n = 1; $n -le $count; $n++) {
                $name = 'slide-{0:D3}.png' -f $n
                $background = Join-Path $CacheRoot "$DeckId\$name"
                if (!(Test-Path -LiteralPath $background -PathType Leaf) -and $oldDeck.Count -and $oldDeck[0].slides.Count -ge $n) {
                    $old = $oldDeck[0].slides[$n-1]
                    if ($old -isnot [string]) { $old = $old.image }
                    # Catalog paths are untrusted. Reject traversal, rooted paths and alternate streams.
                    if ($old -isnot [string] -or $old -notmatch '^mood-meters/slides/[^\\:]+\.png$' -or @($old.Split('/') | Where-Object { $_ -in '', '.', '..' }).Count) { throw 'Unsafe cached PNG path in catalog.' }
                    $relative = $old.Substring('mood-meters/slides/'.Length)
                    $background = [IO.Path]::GetFullPath((Join-Path $CacheRoot $relative))
                    if (!$background.StartsWith($CacheRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Cached PNG escaped staging.' }
                }
                if (!(Test-Path -LiteralPath $background -PathType Leaf)) { throw "Missing cached PNG for slide $n; run with PowerPoint first." }
                Copy-Item -LiteralPath $background -Destination (Join-Path $work $name)
            }
        }
        $slides = @()
        for ($n = 1; $n -le $count; $n++) {
            $image = 'mood-meters/slides/{0}/slide-{1:D3}.png' -f $DeckId,$n
            $overlays = @()
            if ($assets) {
                foreach ($overlay in $assets.slides[$n-1].overlays) {
                    if ($overlay.src -notmatch '^[\w.-]+\.gif$' -or $overlay.src -match '\.\.') { throw 'Unsafe generated GIF filename.' }
                    $overlays += [ordered]@{ src = "mood-meters/slides/$DeckId/$($overlay.src)"; x = $overlay.x; y = $overlay.y; width = $overlay.width; height = $overlay.height; transform = $overlay.transform; crop = $overlay.crop }
                }
            }
            if ($overlays.Count) { $slides += [ordered]@{ image = $image; aspectRatio = $aspect; overlays = $overlays } } else { $slides += $image }
        }
        $deck = [ordered]@{ id = $DeckId; source = $File.Name; title = $File.BaseName; slides = $slides }
        $manifest = [ordered]@{ schemaVersion = 1; exportedAt = [DateTime]::UtcNow.ToString('o'); source = $File.Name; id = $DeckId; aspectRatio = $aspect; skipPowerPoint = [bool]$Skip; deck = $deck; gifAssets = $assets }
        [IO.File]::WriteAllText((Join-Path $work 'manifest.json'),(ConvertTo-Json -InputObject $manifest -Depth 16),(New-Object Text.UTF8Encoding($false)))
        [IO.Directory]::Move($work,$output)
        [pscustomobject]@{ source = $File.Name; id = $DeckId; status = 'exported'; slides = $count; seconds = [Math]::Round($timer.Elapsed.TotalSeconds,2); error = ''; deck = $deck }
    } catch {
        if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
        [pscustomobject]@{ source = $File.Name; id = $DeckId; status = 'failed'; slides = 0; seconds = [Math]::Round($timer.Elapsed.TotalSeconds,2); error = $_.Exception.Message; deck = $null }
    } finally {
        if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
    }
}

try {
    [void][IO.Directory]::CreateDirectory($meters)
    # Keep the lock file: deleting it after release would introduce an acquisition race.
    try { $lock = [IO.File]::Open((Join-Path $meters '.export.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
    catch { throw 'Another export owns the export lock, or the lock file is inaccessible.' }
    # Check the complete deletion tree, including junctions nested under slides.
    if (Test-Path -LiteralPath $slidesRoot) {
        foreach ($entry in Get-ChildItem -LiteralPath $slidesRoot -Recurse -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point in generated slides: $($entry.FullName)" }
        }
    }
    if (!$SkipPowerPoint) {
        # Preflight BEFORE destructive deletion. Keep the application alive until all workers stop.
        $app = New-Object -ComObject PowerPoint.Application
        $presentations = $null
        try {
            $presentations = $app.Presentations
            if ($presentations.Count -ne 0) { throw 'Close open PowerPoint presentations before exporting; refusing to quit a user session.' }
            $quitApp = $true
        } finally { if ($presentations) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentations) } }
    }
    $staging = Join-Path ([IO.Path]::GetTempPath()) ('mood-export-' + [Guid]::NewGuid().ToString('N'))
    $workRoot = Join-Path $staging 'work'
    $cacheRoot = Join-Path $staging 'png-cache'
    [void][IO.Directory]::CreateDirectory($workRoot)
    [void][IO.Directory]::CreateDirectory($cacheRoot)
    if ($SkipPowerPoint) {
        if (Test-Path -LiteralPath $catalogPath) {
            $text = [IO.File]::ReadAllText($catalogPath)
            if ($text -notmatch '(?s)^\s*(?://[^\r\n]*\r?\n)*\s*window\.MOOD_METER_DECKS\s*=\s*(\[.*\])\s*;?\s*$') { throw 'Existing catalog is not generated JSON; refusing deletion.' }
            $prior = @(foreach ($deck in (ConvertFrom-Json $Matches[1])) { $deck })
        }
        # Snapshot ONLY PNGs. Never carry old GIFs, manifests or metadata into the rebuild.
        if (Test-Path -LiteralPath $slidesRoot) {
            foreach ($png in Get-ChildItem -LiteralPath $slidesRoot -Recurse -File -Filter '*.png') {
                $relative = $png.FullName.Substring($slidesRoot.Length).TrimStart('\','/')
                $destination = Join-Path $cacheRoot $relative
                [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
                Copy-Item -LiteralPath $png.FullName -Destination $destination
            }
        }
    }
    $renderGate = New-Object Threading.SemaphoreSlim(1,1)
    $pool = [RunspaceFactory]::CreateRunspacePool(1,$Concurrency)
    $pool.ApartmentState = 'STA'
    $pool.ThreadOptions = 'ReuseThread'
    $pool.Open()
    if (Test-Path -LiteralPath $slidesRoot) { Remove-Item -LiteralPath $slidesRoot -Recurse -Force }
    [void][IO.Directory]::CreateDirectory($slidesRoot)
    Write-Catalog @()
    if (Test-Path -LiteralPath $reportPath) { Remove-Item -LiteralPath $reportPath -Force }
    $next = 0
    while ($next -lt $items.Count -or $jobs.Count) {
        while ($next -lt $items.Count -and $jobs.Count -lt $Concurrency) {
            $item = $items[$next++]
            $ps = [PowerShell]::Create()
            try {
                $ps.RunspacePool = $pool
                [void]$ps.AddScript($worker.ToString()).AddArgument($item.file).AddArgument($item.id).AddArgument($slidesRoot).AddArgument($workRoot).AddArgument($cacheRoot).AddArgument($prior).AddArgument($helper).AddArgument($renderGate).AddArgument([bool]$SkipPowerPoint)
                $handle = $ps.BeginInvoke()
                $jobs.Add([pscustomobject]@{ ps = $ps; handle = $handle; item = $item })
            } catch { $ps.Dispose(); throw }
        }
        foreach ($job in @($jobs.ToArray())) {
            if (!$job.handle.IsCompleted) { continue }
            try {
                $value = @($job.ps.EndInvoke($job.handle))
                if ($job.ps.HadErrors -or $value.Count -ne 1) { throw "Worker failed: $($job.ps.Streams.Error -join '; ')" }
                $result = $value[0]
            } catch {
                $failedOutput = Join-Path $slidesRoot $job.item.id
                if (Test-Path -LiteralPath $failedOutput) { Remove-Item -LiteralPath $failedOutput -Recurse -Force }
                $result = [pscustomobject]@{ source = $job.item.file.Name; id = $job.item.id; status = 'failed'; slides = 0; seconds = 0; error = $_.Exception.Message; deck = $null }
            } finally { $job.ps.Dispose(); [void]$jobs.Remove($job) }
            $results.Add($result)
            if ($result.status -eq 'failed') { Write-Warning "$($result.source): $($result.error) Excluded from new catalog." }
            else { Write-Host "$($result.source): $($result.slides) slides, GIFs preserved." }
            Write-Progress -Activity 'Reconstruction des baromètres' -Status "$($results.Count)/$($items.Count) : $($result.source)" -PercentComplete (100*$results.Count/$items.Count)
            # Main thread only; persist a sorted report as workers finish.
            $results.ToArray() | Sort-Object source | Select-Object source,id,status,slides,seconds,error | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding UTF8
        }
        if ($jobs.Count) {
            [Threading.WaitHandle[]]$handles = @($jobs.ToArray() | ForEach-Object { $_.handle.AsyncWaitHandle })
            [void][Threading.WaitHandle]::WaitAny($handles,100)
        }
    }
    $sorted = @($results.ToArray() | Sort-Object source)
    $success = @($sorted | Where-Object status -eq 'exported')
    Write-Catalog @($success | ForEach-Object { $_.deck })
    [pscustomobject]@{ exported = $success.Count; failures = @($sorted | Where-Object status -eq 'failed' | Select-Object source,error); catalog = $catalogPath; report = $reportPath }
} finally {
    # Stop/dispose workers before closing the pool, quitting Office, or removing staging.
    try {
        foreach ($job in $jobs.ToArray()) { try { $job.ps.Stop() } finally { $job.ps.Dispose() } }
    } finally {
        try { if ($pool) { try { $pool.Close() } finally { $pool.Dispose() } } }
        finally {
            try {
                if ($app) {
                    try {
                        if ($quitApp) {
                            $presentations = $null
                            try {
                                $presentations = $app.Presentations
                                if ($presentations.Count -eq 0) { $app.Quit() }
                                else { Write-Warning 'PowerPoint has open presentations; leaving the shared application running.' }
                            } finally { if ($presentations) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentations) } }
                        }
                    } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
                }
            } finally {
                try {
                    if ($renderGate) { $renderGate.Dispose() }
                    if ($staging -and (Test-Path -LiteralPath $staging)) { Remove-Item -LiteralPath $staging -Recurse -Force }
                } finally { if ($lock) { $lock.Dispose() }; Write-Progress -Activity 'Reconstruction des baromètres' -Completed }
            }
        }
    }
}
# Requires Windows PowerShell 5.1 or PowerShell 7. No Office/Python required.
# Downloads only publicly accessible presentations linked on the source page.
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [uri]$PageUrl = 'https://sites.google.com/scred.k12.mn.us/scredsel/calming-strategies-toolbox/name-your-feelings_express-yourself_cst/gif-mood-meters',
    [string]$OutputFolder = (Join-Path $PSScriptRoot '..\mood-meters\powerpoints'),
    [ValidateRange(0, 10000)][int]$Limit = 0,
    [ValidateRange(1, 600)][int]$TimeoutSec = 120,
    [ValidateRange(1, 16)][int]$Concurrency = 4,
    [uri]$Proxy,
    [System.Management.Automation.PSCredential]$ProxyCredential,
    [switch]$ListOnly,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
if ($PageUrl.Scheme -ne 'https') { throw 'Utilisez une adresse HTTPS.' }
if ($Proxy -and $Proxy.Scheme -notin 'http', 'https') { throw 'Le proxy doit utiliser HTTP ou HTTPS.' }
if ($Proxy -and $Proxy.UserInfo) { throw 'Ne placez pas les identifiants dans l''adresse du proxy. Utilisez -ProxyCredential.' }
# Keep certificate validation enabled; add TLS 1.2 for Windows PowerShell.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot 'gif-mood-assets.ps1')

function Invoke-PresentationRequest {
    param([uri]$Uri, [string]$OutFile)
    $options = @{
        Uri = $Uri.AbsoluteUri; UseBasicParsing = $true; TimeoutSec = $TimeoutSec
    }
    if ($OutFile) { $options.OutFile = $OutFile }
    # Resolve the system proxy separately for each host (including PAC settings).
    # Proxy credentials must never be sent as origin-server credentials.
    $effectiveProxy = $Proxy
    if (!$effectiveProxy -and [Net.WebRequest]::DefaultWebProxy) {
        $systemProxy = [Net.WebRequest]::DefaultWebProxy
        if (!$systemProxy.IsBypassed($Uri)) {
            $resolvedProxy = $systemProxy.GetProxy($Uri)
            if ($resolvedProxy -and $resolvedProxy.AbsoluteUri -ne $Uri.AbsoluteUri) {
                $effectiveProxy = $resolvedProxy
            }
        }
    }
    if ($effectiveProxy) {
        $options.Proxy = $effectiveProxy.AbsoluteUri
        if ($ProxyCredential) { $options.ProxyCredential = $ProxyCredential }
        else { $options.ProxyUseDefaultCredentials = $true }
    } elseif ($ProxyCredential) {
        throw 'Aucun proxy detecte. Indiquez son adresse avec -Proxy pour utiliser -ProxyCredential.'
    }
    try {
        Invoke-WebRequest @options
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 407) {
            $message = 'Authentification du proxy requise (HTTP 407, McAfee/Web Gateway). Les identifiants Windows ont ete proposes au proxy detecte. Si necessaire, indiquez -Proxy et -ProxyCredential (Get-Credential). Si le refus persiste, contactez le service informatique; aucune protection reseau ou TLS n''est contournee.'
            $error = New-Object System.InvalidOperationException -ArgumentList $message, $_.Exception
            $error.Data['HttpStatusCode'] = 407
            throw $error
        }
        throw
    }
}

function Test-PresentationFile {
    param([string]$Path, [string]$Extension)
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    if ($Extension -eq '.ppt') {
        $stream = [IO.File]::OpenRead($Path)
        try {
            $header = New-Object byte[] 8
            return ($stream.Read($header, 0, 8) -eq 8 -and [BitConverter]::ToString($header) -eq 'D0-CF-11-E0-A1-B1-1A-E1')
        } finally { $stream.Dispose() }
    }
    $zip = $null
    try {
        $zip = [IO.Compression.ZipFile]::OpenRead($Path)
        return ($null -ne $zip.GetEntry('[Content_Types].xml') -and $null -ne $zip.GetEntry('ppt/presentation.xml'))
    } catch { return $false }
    finally { if ($zip) { $zip.Dispose() } }
}

Write-Host "Lecture de $PageUrl"
$response = Invoke-PresentationRequest -Uri $PageUrl
$seen = @{}
$items = @()
# Google Sites renders these links in its public HTML; no browser or login needed.
$anchors = [regex]::Matches($response.Content, '(?is)<a\b[^>]*\bhref\s*=\s*["''](?<url>[^"'']+)["''][^>]*>(?<title>.*?)</a>')
foreach ($anchor in $anchors) {
    $href = [Net.WebUtility]::HtmlDecode($anchor.Groups['url'].Value)
    $link = $null
    if (![uri]::TryCreate($PageUrl, $href, [ref]$link)) { continue }
    if ($link.Scheme -ne 'https') { continue }
    # Unwrap standard Google outgoing links, not private access controls.
    if ($link.Host -in 'www.google.com', 'google.com' -and $link.AbsolutePath -eq '/url') {
        $redirect = [regex]::Match($link.Query, '(?:[?&])(?:q|url)=([^&]+)')
        if ($redirect.Success) {
            $decoded = [uri]::UnescapeDataString($redirect.Groups[1].Value)
            if (![uri]::TryCreate($decoded, [UriKind]::Absolute, [ref]$link)) { continue }
            if ($link.Scheme -ne 'https') { continue }
        }
    }
    $slide = [regex]::Match($link.AbsolutePath, '^/presentation/d/([A-Za-z0-9_-]+)(?:/|$)')
    $extension = [IO.Path]::GetExtension($link.AbsolutePath).ToLowerInvariant()
    if ($link.Host -eq 'docs.google.com' -and $slide.Success) {
        $id = $slide.Groups[1].Value
        $key = "slides:$id"
        $download = "https://docs.google.com/presentation/d/$id/export/pptx"
        $extension = '.pptx'
    } elseif ($extension -in '.ppt', '.pptx') {
        $download = $link.AbsoluteUri
        $key = $download
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $id = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)))).Replace('-', '').Substring(0, 16) }
        finally { $sha.Dispose() }
    } else { continue }
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $title = [Net.WebUtility]::HtmlDecode([regex]::Replace($anchor.Groups['title'].Value, '<[^>]+>', ' '))
    $title = ([regex]::Replace($title, '\s+', ' ')).Trim()
    if (!$title) { $title = 'Presentation' }
    $safeTitle = [regex]::Replace($title, '[\x00-\x1f<>:"/\\|?*]', '-').Trim(' ', '.')
    if (!$safeTitle) { $safeTitle = 'Presentation' }
    if ($safeTitle.Length -gt 70) { $safeTitle = $safeTitle.Substring(0, 70).Trim(' ', '.') }
    $items += [pscustomobject]@{
        Title = $title; Source = $link.AbsoluteUri; Download = $download
        FileName = "$safeTitle--$id$extension"; Extension = $extension
    }
}
if (!$items.Count) { throw 'Aucune presentation trouvee. Verifiez la page et son acces public.' }
Write-Host "$($items.Count) presentations uniques trouvees sur cette page."
if ($Limit -gt 0) { $items = @($items | Select-Object -First $Limit) }
if ($ListOnly) { $items | Select-Object Title, Source, FileName; return }

$output = [IO.Path]::GetFullPath($OutputFolder)
if (!$PSCmdlet.ShouldProcess($output, "Telecharger $($items.Count) presentations et enregistrer le rapport CSV")) { return }
New-Item -ItemType Directory -Path $output -Force | Out-Null
$report = New-Object 'System.Collections.Generic.List[object]'
$reportPath = Join-Path $output 'download-report.csv'
$downloaded = 0
$skipped = 0
$failed = 0
$helperPath = Join-Path $PSScriptRoot 'gif-mood-assets.ps1'
$requestFunction = ${function:Invoke-PresentationRequest}.ToString()
$validateFunction = ${function:Test-PresentationFile}.ToString()
$worker = {
    param($item, $output, $TimeoutSec, $Proxy, $ProxyCredential, $Force, $helperPath, $requestFunction, $validateFunction)
    $ErrorActionPreference = 'Stop'
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    . $helperPath
    Set-Item Function:Invoke-PresentationRequest ([scriptblock]::Create($requestFunction))
    Set-Item Function:Test-PresentationFile ([scriptblock]::Create($validateFunction))
    $target = Join-Path $output $item.FileName
    $temporary = "$target.$([guid]::NewGuid().ToString('N')).part"
    $status = 'Downloaded'; $message = ''; $httpStatus = 0; $gifCount = 0; $assetsFolder = ''
    try {
        if (!$Force -and (Test-PresentationFile $target $item.Extension)) { $status = 'Skipped' }
        else {
            Invoke-PresentationRequest -Uri $item.Download -OutFile $temporary
            if (!(Test-PresentationFile $temporary $item.Extension)) { throw 'La reponse n''est pas un PowerPoint valide (connexion, acces refuse ou export bloque).' }
            Move-Item -LiteralPath $temporary -Destination $target -Force
        }
        if ($item.Extension -eq '.pptx') {
            # Keep the original deck as a cache; save real animated GIFs, not renamed PPTX bytes.
            $assetsFolder = Join-Path $output ([IO.Path]::GetFileNameWithoutExtension($item.FileName) + '-gifs')
            $assets = Export-MoodGifAssets -Path $target -OutputFolder $assetsFolder
            $gifCount = $assets.media.Count
        }
    } catch {
        $status = 'Failed'; $message = $_.Exception.Message
        if ($_.Exception.Response) { $httpStatus = [int]$_.Exception.Response.StatusCode }
        if ($_.Exception.Data['HttpStatusCode']) { $httpStatus = [int]$_.Exception.Data['HttpStatusCode'] }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    [pscustomobject]@{ Title = $item.Title; Source = $item.Source; FileName = $item.FileName; Status = $status; GifCount = $gifCount; GifFolder = $assetsFolder; Error = $message; HttpStatusCode = $httpStatus }
}
$pool = [RunspaceFactory]::CreateRunspacePool(1, $Concurrency)
$pool.Open()
$active = New-Object 'System.Collections.Generic.List[object]'
$next = 0; $stopScheduling = $false
Write-Host "Telechargements concurrents : $Concurrency. Extraction des GIF animes incluse."
try {
    while ($active.Count -or (!$stopScheduling -and $next -lt $items.Count)) {
        while (!$stopScheduling -and $next -lt $items.Count -and $active.Count -lt $Concurrency) {
            $shell = [PowerShell]::Create(); $shell.RunspacePool = $pool
            [void]$shell.AddScript($worker.ToString()).AddArgument($items[$next]).AddArgument($output).AddArgument($TimeoutSec).AddArgument($Proxy).AddArgument($ProxyCredential).AddArgument([bool]$Force).AddArgument($helperPath).AddArgument($requestFunction).AddArgument($validateFunction)
            $active.Add([pscustomobject]@{ Shell = $shell; Handle = $shell.BeginInvoke(); Item = $items[$next] })
            $next++
        }
        if (!$active.Count) { break }
        [void][Threading.WaitHandle]::WaitAny([Threading.WaitHandle[]]@($active | ForEach-Object { $_.Handle.AsyncWaitHandle }))
        foreach ($job in @($active.ToArray())) {
            if (!$job.Handle.IsCompleted) { continue }
            try {
                $results = @($job.Shell.EndInvoke($job.Handle))
                if (!$results.Count) { throw "Worker failed: $($job.Shell.Streams.Error | Out-String)" }
                $result = $results[-1]
            } catch {
                $result = [pscustomobject]@{ Title = $job.Item.Title; Source = $job.Item.Source; FileName = $job.Item.FileName; Status = 'Failed'; GifCount = 0; GifFolder = ''; Error = $_.Exception.Message; HttpStatusCode = 0 }
            } finally { $job.Shell.Dispose(); [void]$active.Remove($job) }
            switch ($result.Status) {
                'Downloaded' { $downloaded++ }
                'Skipped' { $skipped++ }
                'Failed' { $failed++; Write-Warning "$($result.Title) : $($result.Error)" }
            }
            if ($result.Status -ne 'Failed') { Write-Host "$($result.Status) : $($result.Title) - $($result.GifCount) GIF" }
            $report.Add($result)
            # Only the main runspace writes the report; no concurrent file corruption.
            $report | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding UTF8
            if ($result.HttpStatusCode -in 407, 429) {
                $stopScheduling = $true
                Write-Warning "HTTP $($result.HttpStatusCode) : aucun nouveau telechargement ne sera lance. Relancez apres resolution; les fichiers valides seront ignores."
            }
            Write-Progress -Activity 'Telechargement et extraction des GIF' -Status "$($report.Count)/$($items.Count)" -PercentComplete (100 * $report.Count / $items.Count)
        }
    }
} finally {
    foreach ($job in $active) { try { $job.Shell.Stop() } finally { $job.Shell.Dispose() } }
    $pool.Close(); $pool.Dispose()
    Write-Progress -Activity 'Telechargement et extraction des GIF' -Completed
}
Write-Host "Termine : $downloaded telecharges, $skipped deja presents, $failed echecs."
Write-Host "Rapport : $reportPath"
Write-Host 'GIF sauvegardes dans les sous-dossiers *-gifs. Lancez scripts/export-mood-meters.ps1 pour publier les barometres complets avec leurs GIF en boucle.'
if ($failed -gt 0) { Write-Warning 'Certains liens sont indisponibles. Consultez le rapport; aucun acces prive n''a ete contourne.' }
[CmdletBinding()]
param([switch]$Refresh, [switch]$CategoriesOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$catalogPath = Join-Path $root 'src/lib/remote-mood-catalog.json'
if ($CategoriesOnly) {
    $items = @()
} elseif ($Refresh) {
    $items = @(& (Join-Path $PSScriptRoot 'download-mood-meters.ps1') -ListOnly)
} else {
    $items = @(Import-Csv (Join-Path $root 'mood-meters/powerpoints/download-report.csv'))
}
$seen = @{}
$catalog = @(foreach ($item in $items) {
    if ($item.Source -notmatch '^https://docs\.google\.com/presentation/d/([\w-]+)(?:/|$)') { continue }
    $googleId = $Matches[1]
    if ($seen[$googleId]) { continue }
    $seen[$googleId] = $true
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $id = 'deck-' + ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($item.FileName.ToLowerInvariant()))).Replace('-','').Substring(0,20).ToLowerInvariant()) }
    finally { $sha.Dispose() }
    [ordered]@{ id = $id; title = $item.Title; googleId = $googleId; fileName = $item.FileName }
})
if ($CategoriesOnly) { $catalog = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 $catalogPath) }
if (!$catalog.Count) { throw 'No public presentation URLs found.' }
foreach ($entry in $catalog) {
    if ($entry.id -isnot [string] -or $entry.googleId -isnot [string] -or $entry.title -isnot [string] -or $entry.fileName -isnot [string]) {
        throw 'Invalid catalogue entry; existing file left unchanged.'
    }
}
$url = 'https://sites.google.com/scred.k12.mn.us/scredsel/calming-strategies-toolbox/name-your-feelings_express-yourself_cst/gif-mood-meters'
$request = @{ Uri = $url; UseBasicParsing = $true; TimeoutSec = 60 }
$proxy = [Net.WebRequest]::DefaultWebProxy
if ($proxy -and !$proxy.IsBypassed([uri]$url)) {
    $request.Proxy = $proxy.GetProxy([uri]$url)
    $request.ProxyUseDefaultCredentials = $true
}
$response = Invoke-WebRequest @request
$reader = New-Object IO.StreamReader($response.RawContentStream, [Text.Encoding]::UTF8)
try { $html = $reader.ReadToEnd() } finally { $reader.Dispose() }
$categories = @{}
$category = $null
# Read headings and presentation anchors in document order, never infer from titles.
foreach ($token in [regex]::Matches($html, '(?is)<h2\b[^>]*>.*?</h2>|<a\b[^>]*href="[^"]*docs\.google\.com/presentation/d/[^"]*"[^>]*>.*?</a>')) {
    if ($token.Value -match '(?is)^<h2\b') {
        $heading = [Net.WebUtility]::HtmlDecode(($token.Value -replace '<[^>]+>', '')).Trim()
        $category = if ($heading -like 'GIF Mood Meters*') { $null } else { $heading }
    } elseif ($category -and $token.Value -match 'docs\.google\.com/presentation/d/([\w-]+)') {
        $googleId = $Matches[1]
        if (!$categories.ContainsKey($googleId)) { $categories[$googleId] = $category }
    }
}
if ($categories.Count -lt 100) { throw 'Category extraction incomplete; existing catalogue left unchanged.' }
$catalog = @(foreach ($entry in $catalog) {
    $label = $categories[$entry.googleId]
    if (!$label) { $label = 'Other' }
    [pscustomobject][ordered]@{ id = $entry.id; title = $entry.title; googleId = $entry.googleId; fileName = $entry.fileName; category = $label }
})
[IO.File]::WriteAllText($catalogPath, (ConvertTo-Json -InputObject $catalog -Depth 4), (New-Object Text.UTF8Encoding($false)))
$catalog | Group-Object category | Select-Object Name,Count | Format-Table
Write-Host "Saved $($catalog.Count) presentation URLs (no downloads)."
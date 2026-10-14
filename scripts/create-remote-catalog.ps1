[CmdletBinding()]
param([switch]$Refresh)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
if ($Refresh) {
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
if (!$catalog.Count) { throw 'No public presentation URLs found.' }
[IO.File]::WriteAllText((Join-Path $root 'src/lib/remote-mood-catalog.json'), (ConvertTo-Json -InputObject $catalog -Depth 4), (New-Object Text.UTF8Encoding($false)))
Write-Host "Saved $($catalog.Count) presentation URLs (no downloads)."
# Isolated integration tests. Never invokes the exporter in the live project.
[CmdletBinding()]
param([switch]$SkipNativeTest)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mood-export-test-' + [Guid]::NewGuid().ToString('N'))
function Assert($Condition,[string]$Message) { if (!$Condition) { throw "Assertion failed: $Message" } }
function Read-Catalog([string]$Path) {
    $text = [IO.File]::ReadAllText($Path)
    Assert ($text -match '(?s)window\.MOOD_METER_DECKS\s*=\s*(\[.*\])\s*;') 'catalog JSON array'
    foreach ($deck in (ConvertFrom-Json $Matches[1])) { $deck }
}
function Get-LiveFingerprint {
    $paths = @(Get-ChildItem -LiteralPath (Join-Path $root 'mood-meters\slides') -Recurse -File)
    $paths += Get-Item -LiteralPath (Join-Path $root 'mood-meters\catalog.js')
    return ($paths | Sort-Object FullName | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n"
}
$before = Get-LiveFingerprint
$tempBefore = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'mood-export-*' | ForEach-Object FullName)
try {
    $scripts = Join-Path $fixture 'scripts'
    $sources = Join-Path $fixture 'mood-meters\powerpoints'
    $slides = Join-Path $fixture 'mood-meters\slides'
    $catalog = Join-Path $fixture 'mood-meters\catalog.js'
    $report = Join-Path $fixture 'mood-meters\export-report.csv'
    [void][IO.Directory]::CreateDirectory($scripts)
    [void][IO.Directory]::CreateDirectory($sources)
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'export-mood-meters.ps1'),(Join-Path $PSScriptRoot 'gif-mood-assets.ps1') -Destination $scripts
    $exporter = Join-Path $scripts 'export-mood-meters.ps1'
    $decks = @(Read-Catalog (Join-Path $root 'mood-meters\catalog.js') | Sort-Object source | Select-Object -First 2)
    Assert ($decks.Count -eq 2) 'two cached decks required'
    $prior = @()
    $sourceHashes = @{}
    for ($i = 0; $i -lt 2; $i++) {
        $deck = $decks[$i]
        $sourcePath = Join-Path $root ('mood-meters\powerpoints\' + $deck.source)
        Copy-Item -LiteralPath $sourcePath -Destination $sources
        $sourceHashes[$deck.source] = (Get-FileHash -LiteralPath $sourcePath).Hash
        $legacy = 'legacy-' + $i
        [void][IO.Directory]::CreateDirectory((Join-Path $slides $legacy))
        $oldSlides = @()
        for ($n = 0; $n -lt $deck.slides.Count; $n++) {
            $image = $deck.slides[$n]
            if ($image -isnot [string]) { $image = $image.image }
            $name = 'old-{0:D3}.png' -f ($n+1)
            Copy-Item -LiteralPath (Join-Path $root $image) -Destination (Join-Path $slides "$legacy\$name")
            $oldSlides += "mood-meters/slides/$legacy/$name"
        }
        $prior += [ordered]@{ id = $legacy; source = $deck.source; title = $deck.title; slides = $oldSlides }
    }
    # All writes below affect only the private fixture.
    [IO.File]::WriteAllText($catalog,('window.MOOD_METER_DECKS = ' + (ConvertTo-Json -InputObject $prior -Depth 16) + ';'))
    $stale = Join-Path $slides 'unrelated-stale'
    [void][IO.Directory]::CreateDirectory($stale)
    foreach ($name in @('old.gif','manifest.json','old.png','nested.txt')) { [IO.File]::WriteAllText((Join-Path $stale $name),'obsolete') }
    $oldCatalog = [IO.File]::ReadAllText($catalog)
    $processesBefore = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id)
    & $exporter -WhatIf
    Assert (([IO.File]::ReadAllText($catalog)) -eq $oldCatalog) 'WhatIf preserves catalog'
    Assert (Test-Path -LiteralPath $stale) 'WhatIf preserves slides'
    Assert (!(Test-Path -LiteralPath (Join-Path $fixture 'mood-meters\.export.lock'))) 'WhatIf creates no lock'
    Assert ((@(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id) -join ',') -eq ($processesBefore -join ',')) 'WhatIf starts no COM server'
    $result = & $exporter -SkipPowerPoint -Concurrency 2
    Assert ($result.exported -eq 2 -and $result.failures.Count -eq 0) 'two concurrent cached exports'
    Assert (!(Test-Path -LiteralPath $stale)) 'all stale assets removed'
    Assert (!(Test-Path -LiteralPath (Join-Path $slides 'legacy-0'))) 'legacy PNG cache directories removed'
    $new = @(Read-Catalog $catalog)
    Assert (($new.source -join '|') -eq (($decks | Sort-Object source).source -join '|')) 'catalog sorted'
    Assert (@(Import-Csv -LiteralPath $report).Count -eq 2) 'two report entries'
    Assert (@(Get-ChildItem -LiteralPath $slides -Recurse -File -Filter '*.gif').Count -gt 0) 'GIFs regenerated'
    foreach ($deck in $decks) {
        Assert ((Get-FileHash -LiteralPath (Join-Path $sources $deck.source)).Hash -eq $sourceHashes[$deck.source]) 'source unchanged'
    }
    # Lock contention must fail before deleting generated outputs.
    $lock = [IO.File]::Open((Join-Path $fixture 'mood-meters\.export.lock'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        $rejected = $false
        try { & $exporter -SkipPowerPoint } catch { $rejected = $_.Exception.Message -match 'export lock' }
        Assert $rejected 'overlapping export rejected'
        Assert (@(Read-Catalog $catalog).Count -eq 2) 'lock rejection preserves catalog'
    } finally { $lock.Dispose() }
    $empty = Join-Path $fixture 'empty'
    [void][IO.Directory]::CreateDirectory($empty)
    $rejected = $false
    try { & $exporter -SourceFolder $empty -SkipPowerPoint } catch { $rejected = $true }
    Assert $rejected 'empty source rejected'
    $rejected = $false
    try { & $exporter -SourceFolder $slides -SkipPowerPoint } catch { $rejected = $true }
    Assert $rejected 'source inside slides rejected'
    $rejected = $false
    try { & $exporter -Concurrency 9 -WhatIf } catch { $rejected = $true }
    Assert $rejected 'concurrency range enforced'
    # Drop one required PNG: no old catalog entry or failed output may survive.
    $failedId = $new[0].id
    Remove-Item -LiteralPath (Join-Path $slides "$failedId\slide-001.png")
    $result = & $exporter -SkipPowerPoint -Concurrency 2
    Assert ($result.exported -eq 1 -and $result.failures.Count -eq 1) 'missing PNG isolates failure'
    Assert (!(Test-Path -LiteralPath (Join-Path $slides $failedId))) 'failed deck directory removed'
    Assert (@(Read-Catalog $catalog).Count -eq 1) 'failed prior entry not retained'
    Assert (@(Import-Csv -LiteralPath $report | Where-Object status -eq 'failed').Count -eq 1) 'failure reported'
    # Both decks fail: catalog still rebuilt as an empty JSON array.
    Get-ChildItem -LiteralPath $slides -Recurse -File -Filter '*.png' | Remove-Item -Force
    $result = & $exporter -SkipPowerPoint -Concurrency 2
    Assert ($result.exported -eq 0 -and $result.failures.Count -eq 2) 'all failures counted'
    Assert (@(Read-Catalog $catalog).Count -eq 0) 'empty catalog on all failures'
    Assert (@(Get-ChildItem -LiteralPath $slides -Force).Count -eq 0) 'no failed outputs remain'
    Write-Host 'PASS: WhatIf, concurrent PNG-cache rebuild, stale cleanup, immutable sources, sorted catalog/report, lock, validation, isolated/all failures.'
    if (!$SkipNativeTest -and [Type]::GetTypeFromProgID('PowerPoint.Application') -and !@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count) {
        $result = & $exporter -Concurrency 2
        Assert ($result.exported -eq 2 -and $result.failures.Count -eq 0) 'native two-worker render'
        Assert (@(Read-Catalog $catalog).Count -eq 2) 'native catalog'
        Assert (@(Get-ChildItem -LiteralPath $slides -Recurse -File -Filter '*.png').Count -eq ($decks[0].slides.Count + $decks[1].slides.Count)) 'native PNG count'
        foreach ($deck in $decks) { Assert ((Get-FileHash -LiteralPath (Join-Path $sources $deck.source)).Hash -eq $sourceHashes[$deck.source]) 'native source unchanged' }
        Write-Host 'PASS: isolated native PowerPoint rendering with two STA workers and shared serialization.'
    } else { Write-Host 'SKIP: native test (PowerPoint unavailable, already running, or -SkipNativeTest).' }
    Assert ((Get-LiveFingerprint) -eq $before) 'live outputs untouched'
    $leaks = @(Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'mood-export-*' | Where-Object { $_.FullName -ne $fixture -and $_.FullName -notin $tempBefore })
    Assert ($leaks.Count -eq 0) 'no staging leaks'
    Write-Host 'PASS: live outputs unchanged and temporary staging cleaned.'
} finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
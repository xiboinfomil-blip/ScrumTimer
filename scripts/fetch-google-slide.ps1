# Network adapter for Windows corporate proxies. No local image files or Office.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$GoogleId, [string]$PageId)
$ErrorActionPreference = 'Stop'
if ($GoogleId -notmatch '^[\w-]+$' -or ($PageId -and $PageId -notmatch '^[\w.-]+$')) { throw 'Invalid slide ID.' }
$suffix = if ($PageId) { "export/svg?pageid=$PageId" } else { 'preview' }
$uri = [uri]"https://docs.google.com/presentation/d/$GoogleId/$suffix"
$options = @{ Uri = $uri; UseBasicParsing = $true; TimeoutSec = 40; MaximumRedirection = 5 }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$proxy = [Net.WebRequest]::DefaultWebProxy
if ($proxy -and !$proxy.IsBypassed($uri)) { $options.Proxy = $proxy.GetProxy($uri).AbsoluteUri; $options.ProxyUseDefaultCredentials = $true }
$response = Invoke-WebRequest @options
if ($PageId -and $response.Headers['Content-Type'] -notmatch '^image/svg\+xml') { throw 'SVG export denied.' }
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::Write($response.Content)
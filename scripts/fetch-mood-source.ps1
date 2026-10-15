[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$uri = [uri]'https://sites.google.com/scred.k12.mn.us/scredsel/calming-strategies-toolbox/name-your-feelings_express-yourself_cst/gif-mood-meters'
$options = @{ Uri = $uri; UseBasicParsing = $true; TimeoutSec = 40; MaximumRedirection = 5 }
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$proxy = [Net.WebRequest]::DefaultWebProxy
if ($proxy -and !$proxy.IsBypassed($uri)) { $options.Proxy = $proxy.GetProxy($uri).AbsoluteUri; $options.ProxyUseDefaultCredentials = $true }
$response = Invoke-WebRequest @options
$reader = New-Object IO.StreamReader($response.RawContentStream, [Text.Encoding]::UTF8)
try { $html = $reader.ReadToEnd() } finally { $reader.Dispose() }
if ([Text.Encoding]::UTF8.GetByteCount($html) -gt 10MB) { throw 'Source page too large.' }
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::Write($html)
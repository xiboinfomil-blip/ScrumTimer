# Neon HTTPS adapter: use the Windows system proxy and current Windows identity.
# Secrets arrive only on stdin, never command-line arguments or temporary files.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $uri = [uri]$payload.url
    if ($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/sql' -or $uri.Host -notmatch '^[a-z0-9.-]+\.neon\.tech$' -or $uri.UserInfo -or $uri.Query) { throw 'Invalid endpoint' }
    $headers = @{}
    foreach ($property in $payload.headers.PSObject.Properties) { $headers[$property.Name] = [string]$property.Value }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $options = @{ Uri = $uri; Method = 'POST'; Headers = $headers; Body = [Text.Encoding]::UTF8.GetBytes([string]$payload.body); UseBasicParsing = $true; TimeoutSec = 40; MaximumRedirection = 0 }
    $proxy = [Net.WebRequest]::DefaultWebProxy
    if ($proxy -and !$proxy.IsBypassed($uri)) {
        $options.Proxy = $proxy.GetProxy($uri).AbsoluteUri
        $options.ProxyUseDefaultCredentials = $true
    }
    try {
        $response = Invoke-WebRequest @options
        $status = [int]$response.StatusCode
        $body = [string]$response.Content
    } catch {
        $response = $_.Exception.Response
        if (!$response) { throw }
        $status = [int]$response.StatusCode
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { $body = $reader.ReadToEnd() } finally { $reader.Dispose(); $response.Close() }
    }
    if ([Text.Encoding]::UTF8.GetByteCount($body) -gt 16777216) { throw 'Response too large' }
    [Console]::Write((@{ status = $status; body = $body } | ConvertTo-Json -Compress))
} catch {
    # Do not print PowerShell errors: they can contain request headers/secrets.
    $code = 'NEON_PROXY_FAILED'
    $exception = $_.Exception
    if ($exception -is [Net.WebException]) {
        $code = 'NEON_PROXY_' + $exception.Status.ToString().ToUpperInvariant()
    }
    [Console]::Error.Write($code)
    exit 1
}
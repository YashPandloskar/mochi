# mochi hook script: reads Claude Code hook JSON from stdin and POSTs it to the local mochi server.
# PermissionRequest events are held open until Allow/Deny and the decision JSON is printed to stdout.
# Any failure (mochi not running, timeout, bad config) exits 0 silently so Claude Code carries on normally.
$ErrorActionPreference = 'Stop'
# mochi's own Chat tab runs claude with this set: never report those runs as Claude jobs
if ($env:MOCHI_CHAT) { exit 0 }
try {
    $reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    $json = $reader.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($json)) { exit 0 }

    $cfgPath = Join-Path $env:USERPROFILE '.mochi\config.json'
    if (-not (Test-Path $cfgPath)) { exit 0 }
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    if (-not $cfg.token -or -not $cfg.port) { exit 0 }

    # MOCHI_PORT lets a test copy of mochi receive events instead of the real one
    $port = if ($env:MOCHI_PORT) { $env:MOCHI_PORT } else { $cfg.port }
    $eventName = ($json | ConvertFrom-Json).hook_event_name
    $isApproval = $eventName -eq 'PermissionRequest'
    $route = if ($isApproval) { 'approval' } else { 'event' }
    # Must stay above approvalTimeoutSeconds in src/theme.js and below the hook timeout in settings.json.
    $timeout = if ($isApproval) { 110 } else { 3 }

    $resp = Invoke-WebRequest -UseBasicParsing -Method Post `
        -Uri ("http://127.0.0.1:{0}/{1}" -f $port, $route) `
        -Headers @{ 'X-Mochi-Token' = $cfg.token } `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
        -TimeoutSec $timeout

    if ($isApproval -and $resp.Content) { [Console]::Out.Write($resp.Content) }
} catch {
    # fall through to Claude Code's normal behaviour
}
exit 0

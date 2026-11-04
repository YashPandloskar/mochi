# Tells mochi what any tool is doing, so the notch reacts the same way it does for Claude Code.
#   .\scripts\mochi-ping.ps1 working -Label "Cursor" -Message "Refactoring checkout"
#   .\scripts\mochi-ping.ps1 needs   -Label "Cursor" -Message "Waiting for you to approve"
#   .\scripts\mochi-ping.ps1 done    -Label "Cursor" -Message "All done"
#   .\scripts\mochi-ping.ps1 idle
# States: working, needs, done, idle, error. Call it from any script, build step or tool that can run a command.
# mochi must be running; nothing leaves your PC (it talks to 127.0.0.1 with the private token in ~\.mochi\config.json).
param(
    [Parameter(Mandatory, Position = 0)][ValidateSet('working', 'needs', 'done', 'idle', 'error')][string]$State,
    [string]$Label = 'Assistant',
    [string]$Message = ''
)
$ErrorActionPreference = 'Stop'
$cfgPath = Join-Path $env:USERPROFILE '.mochi\config.json'
if (-not (Test-Path $cfgPath)) { Write-Error 'mochi has not been started yet (no config file).'; exit 1 }
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$body = @{ state = $State; label = $Label; message = $Message } | ConvertTo-Json -Compress
try {
    $port = if ($env:MOCHI_PORT) { $env:MOCHI_PORT } else { $cfg.port }
    Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$port/ping" -Headers @{ 'x-mochi-token' = $cfg.token } -ContentType 'application/json' -Body $body -TimeoutSec 3 | Out-Null
} catch {
    Write-Error "Could not reach mochi: $($_.Exception.Message)"
    exit 1
}

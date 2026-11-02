# Sends fake Claude Code hook events through the real hooks\send-event.ps1, so every notch state
# can be tried without running Claude. mochi must be running (npm start).
#   .\scripts\fake-events.ps1 -Scenario work       Read -> Edit -> Test, then Stop
#   .\scripts\fake-events.ps1 -Scenario approval   holds until you pick Allow/Deny in the tray menu
#   .\scripts\fake-events.ps1 -Scenario done       a quick Stop
param([ValidateSet('work', 'approval', 'done')][string]$Scenario = 'work', [int]$DelaySeconds = 2)

$hook = Join-Path $PSScriptRoot '..\hooks\send-event.ps1'
$sid = 'fake-session-1'
$cwd = 'C:\Users\Lenovo\webshop'

function Send($ev) {
    $ev.session_id = $sid
    $ev.cwd = $cwd
    $ev.permission_mode = 'default'
    $out = ($ev | ConvertTo-Json -Depth 8 -Compress) | powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hook
    Write-Host ("{0,-18} {1,-8} -> {2}" -f $ev.hook_event_name, $ev.tool_name, $(if ($out) { $out } else { '(no output)' }))
}

switch ($Scenario) {
    'work' {
        Send @{ hook_event_name = 'PreToolUse'; tool_name = 'Read'; tool_input = @{ file_path = "$cwd\checkout.ts" } }
        Start-Sleep $DelaySeconds
        Send @{ hook_event_name = 'PreToolUse'; tool_name = 'Edit'; tool_input = @{ file_path = "$cwd\checkout.ts"; old_string = 'const total = 0'; new_string = 'const total = sum(items)' } }
        Start-Sleep $DelaySeconds
        Send @{ hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'npm test' } }
        Start-Sleep $DelaySeconds
        Send @{ hook_event_name = 'PostToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'npm test' }; tool_response = @{ stdout = 'Tests: 48 passed, 48 total' } }
        Start-Sleep $DelaySeconds
        Send @{ hook_event_name = 'Stop'; stop_hook_active = $false; last_assistant_message = 'Done! The total now adds VAT the right way. All 48 tests pass.' }
    }
    'approval' {
        Send @{ hook_event_name = 'PreToolUse'; tool_name = 'Bash'; tool_input = @{ command = 'rm -rf build' } }
        Write-Host 'Waiting for Allow/Deny in the mochi tray menu (falls back after ~100s)...'
        Send @{ hook_event_name = 'PermissionRequest'; tool_name = 'Bash'; tool_input = @{ command = 'rm -rf build' } }
    }
    'done' {
        Send @{ hook_event_name = 'Stop'; stop_hook_active = $false; last_assistant_message = 'All done.' }
    }
}

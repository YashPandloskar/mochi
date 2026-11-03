# Soak test: drives the real notch with a real mouse and keyboard, in random order, and checks that every action
# did what it should. It takes over the mouse for a few minutes, so leave the computer alone while it runs.
#   .\scripts\soak.ps1              about 3 minutes
#   .\scripts\soak.ps1 -Rounds 60   longer
# It stops your running mochi, starts a throw-away copy (its own notes file, so your notes are untouched) and
# starts your mochi again at the end. Exit code 0 = everything passed.
param([int]$Rounds = 30, [int]$Seed = 11, [int]$Only = -1)

$root = Split-Path $PSScriptRoot -Parent
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$cdp = Join-Path $PSScriptRoot 'cdp.js'
$logFile = Join-Path $env:USERPROFILE '.mochi\mochi.log'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public class SoakMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
}
'@

function Ev($js) { (node $cdp $js) -replace '^"|"$', '' }
function At($sel) {
    $j = node $cdp "(() => { const b=[...document.querySelectorAll('$sel')].find(x=>x.offsetParent); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round((window.screenX+r.x+r.width/2)*devicePixelRatio),y:Math.round((window.screenY+r.y+r.height/2)*devicePixelRatio)}; })()"
    if ($j -eq 'null') { return $null }
    $j | ConvertFrom-Json
}
function Click($p, [int]$holdMs = 100) {
    [SoakMouse]::SetCursorPos($p.x, $p.y) | Out-Null
    Start-Sleep -Milliseconds (350 + $rnd.Next(0, 400))
    [SoakMouse]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds $holdMs; [SoakMouse]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 750
}
function Open { [SoakMouse]::SetCursorPos(60, 700) | Out-Null; Start-Sleep -Milliseconds 700; [SoakMouse]::SetCursorPos(960, 8) | Out-Null; Start-Sleep -Milliseconds 2200 }
function Leave { [SoakMouse]::SetCursorPos(60, 700) | Out-Null; Start-Sleep -Milliseconds 1800 }
$fails = New-Object System.Collections.ArrayList
$checks = 0
function Check($ok, $what) { $script:checks++; if (-not $ok) { [void]$fails.Add($what); Write-Host "  FAIL: $what" -ForegroundColor Red } }
$active = { Ev "document.querySelector('.nav-item.active')?.dataset.tab" }
$expanded = { (Ev "document.getElementById('notch').className") -match 'expanded' }

Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2
Remove-Item $logFile -ErrorAction SilentlyContinue
$notes = Join-Path $env:TEMP 'mochi-soak-notes.md'
Remove-Item $notes -ErrorAction SilentlyContinue
$env:MOCHI_NOTES_FILE = $notes
Start-Process $electron -ArgumentList $root, '--remote-debugging-port=9333' -WindowStyle Hidden
Remove-Item Env:MOCHI_NOTES_FILE
Start-Sleep 10
$rnd = New-Object System.Random $Seed
$tabs = 'home', 'claude', 'music', 'focus', 'notes', 'chat'

for ($r = 1; $r -le $Rounds; $r++) {
    $kind = $rnd.Next(0, 7)
    if ($Only -ge 0) { $kind = $Only }
    Write-Host "round ${r}: kind $kind"
    switch ($kind) {
        0 { # open and click a few random tabs
            Open
            Check (& $expanded) "round ${r}: the notch opened on hover"
            foreach ($i in 1..3) {
                $t = $tabs[$rnd.Next(0, 6)]; $p = At ".nav-item[data-tab=$t]"
                if ($p) { Click $p; Check ((& $active) -eq $t) "round ${r}: clicking the $t tab showed $(& $active)" }
            }
            Leave; Check (-not (& $expanded)) "round ${r}: the notch collapsed after the pointer left"
        }
        1 { # pause and resume (the hide/show path used by game mode)
            [System.Windows.Forms.SendKeys]::SendWait('^%m'); Start-Sleep 1.2
            [System.Windows.Forms.SendKeys]::SendWait('^%m'); Start-Sleep 2
            Open
            foreach ($t in 'music', 'home') { $p = At ".nav-item[data-tab=$t]"; if ($p) { Click $p; Check ((& $active) -eq $t) "round ${r}: after pause/resume, the $t tab did not respond" } }
            Leave
        }
        2 { # focus timer: press the button twice, it must toggle each time (whatever state it started in)
            Open
            $p = At '.nav-item[data-tab=focus]'; if ($p) { Click $p }
            $label = { Ev "[...document.querySelectorAll('[data-r=go]')].find(b => b.offsetParent)?.textContent" }
            foreach ($i in 1..2) {
                $go = At '[data-r=go]'
                if (-not $go) { break }
                $was = & $label
                Click $go
                $now = & $label
                Check ($now -ne $was -and $now -match 'Start|Reset') "round ${r}: pressing the timer button ($i) left it on '$was' (now '$now')"
            }
            Leave
        }
        3 { # notes: add a task by typing
            Open
            $p = At '.nav-item[data-tab=notes]'; if ($p) { Click $p }
            $box = At '[data-r=add]'
            if ($box) {
                $before = [int](Ev "document.querySelectorAll('.nt-item').length")
                Click $box
                [System.Windows.Forms.SendKeys]::SendWait("soak $r{ENTER}"); Start-Sleep 0.8
                Check (([int](Ev "document.querySelectorAll('.nt-item').length")) -eq $before + 1) "round ${r}: a typed task was not added"
            }
            Leave
        }
        4 { # chat: focus the box, type, let go with Esc, and the notch must still collapse
            Open
            $p = At '.nav-item[data-tab=chat]'; if ($p) { Click $p }
            $ta = At '[data-r=ta]'
            if ($ta) { Click $ta; [System.Windows.Forms.SendKeys]::SendWait('hello'); Start-Sleep 0.4; [System.Windows.Forms.SendKeys]::SendWait('{ESC}'); Start-Sleep 0.5 }
            Leave; Check (-not (& $expanded)) "round ${r}: the notch stayed open after typing in Chat and pressing Esc"
            Ev "document.querySelector('[data-r=ta]') && (document.querySelector('[data-r=ta]').value = '')" | Out-Null
        }
        5 { # a Claude job passes through (fake hook events) while the notch is used
            Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'fake-events.ps1'), '-Scenario', 'work', '-DelaySeconds', '2' -WindowStyle Hidden
            Open
            foreach ($i in 1..3) { $t = $tabs[$rnd.Next(0, 6)]; $p = At ".nav-item[data-tab=$t]"; if ($p) { Click $p } }
            Start-Sleep 9; Leave
        }
        6 { # quick in-and-out flicks must neither open nor wedge the notch
            Leave
            # a text box that still has focus is let go of after typingReleaseSeconds (4 s), then the notch closes
            $waited = 0; while ((& $expanded) -and $waited -lt 8) { Start-Sleep 1; $waited++ }
            Check (-not (& $expanded)) "round ${r}: the notch had not collapsed 8 s after the pointer left"
            foreach ($i in 1..4) { [SoakMouse]::SetCursorPos(960, 8) | Out-Null; Start-Sleep -Milliseconds 120; [SoakMouse]::SetCursorPos(60, 700) | Out-Null; Start-Sleep -Milliseconds 250 }
            Start-Sleep 1; Check (-not (& $expanded)) "round ${r}: quick flicks across the notch opened it"
            Open; $p = At '.nav-item[data-tab=home]'; if ($p) { Click $p; Check ((& $active) -eq 'home') "round ${r}: Home did not respond after flicks" }
            Leave
        }
    }
}

# the page must not have reported errors, and nothing may have crashed or been rebuilt
$log = if (Test-Path $logFile) { Get-Content $logFile } else { @() }
Check (-not ($log | Where-Object { $_ -notmatch 'AudioContext' } | Select-String 'page error|uncaught|unhandled|renderer process gone|recreating')) "mochi.log contains errors: $($log -join ' | ')"
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep 2
Start-Process $electron -ArgumentList $root -WindowStyle Hidden
Remove-Item $notes -ErrorAction SilentlyContinue

Write-Host ("{0} checks, {1} failed" -f $checks, $fails.Count)
exit ([int]($fails.Count -gt 0))

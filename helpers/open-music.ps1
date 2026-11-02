# Opens (or brings forward) the Apple Music app so you can pick songs yourself.
# If it already has a window it is restored and raised; otherwise it is launched.
# (Windows ignores a plain launch request for an app that is already running behind other windows.)
# Failures are written to ~\.mochi\open-music.log.
param([string]$AppId = 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App')

function Log($msg) {
    try { Add-Content -Path (Join-Path $env:USERPROFILE '.mochi\open-music.log') -Value ("{0} {1}" -f (Get-Date -Format s), $msg) } catch { }
}

try {
    Add-Type -Namespace Mochi -Name Raise -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
'@

    $p = Get-Process AppleMusic -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($p) {
        $h = $p.MainWindowHandle
        if ([Mochi.Raise]::IsIconic($h)) { [void][Mochi.Raise]::ShowWindow($h, 9) }   # SW_RESTORE
        # a tap of Alt lets this background process take the foreground
        [Mochi.Raise]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
        [Mochi.Raise]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
        $ok = [Mochi.Raise]::SetForegroundWindow($h)
        if (-not $ok) { Log "SetForegroundWindow refused (handle $h)" }
    } else {
        Start-Process explorer.exe -ArgumentList "shell:AppsFolder\$AppId"
    }
} catch {
    Log ("error: " + $_.Exception.Message)
}

# mochi foreground helper: prints the program name of the active window as a JSON line whenever it
# changes, e.g. {"exe":"dota2.exe"}. mochi uses it to hide the notch while a game is in front.
# Only the program name is read (no window titles or content). Quits when stdin closes.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -Namespace Mochi -Name Win -MemberDefinition @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
'@

$state = [hashtable]::Synchronized(@{ open = $true })
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$rs.SessionStateProxy.SetVariable('state', $state)
$reader = [powershell]::Create()
$reader.Runspace = $rs
[void]$reader.AddScript({
    while ($null -ne [Console]::In.ReadLine()) { }
    $state.open = $false
})
[void]$reader.BeginInvoke()

$last = $null
while ($state.open) {
    $exe = ''
    try {
        $procId = [uint32]0
        [void][Mochi.Win]::GetWindowThreadProcessId([Mochi.Win]::GetForegroundWindow(), [ref]$procId)
        if ($procId -ne 0) { $exe = (Get-Process -Id $procId -ErrorAction Stop).ProcessName + '.exe' }
    } catch { $exe = '' }
    if ($exe -ne $last) {
        [Console]::Out.WriteLine((@{ exe = $exe } | ConvertTo-Json -Compress))
        [Console]::Out.Flush()
        $last = $exe
    }
    Start-Sleep -Milliseconds 1000
}

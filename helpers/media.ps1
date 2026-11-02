# mochi media helper: streams the Apple Music now-playing state as JSON lines on stdout, using the
# Windows media controls (System Media Transport Controls). Only the session whose app id matches
# -Match is looked at; every other player is ignored.
#
#   stdout   {"status":"none"}  or  {"status":"playing|paused|stopped","title":..,"artist":..,"album":..,
#             "artKey":..,"art":"data:image/..;base64,..." (only when the track changes),
#             "position":sec,"duration":sec,"at":epoch-ms}
#   stdin    one command per line: playpause | next | prev   (quits when stdin closes)
#
#   -List    print every media session's app id and exit (diagnostics)
param([string]$Match = 'AppleMusic', [switch]$List)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

# Returns the result wrapped in a one-item array (index [0]) so PowerShell does not unwrap WinRT objects.
function Await($op, [type]$type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    [void]$task.Wait(5000)
    if ($task.IsCompleted) { , $task.Result } else { , $null }
}

$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$mgr = (Await ($mgrType::RequestAsync()) $mgrType)[0]

if ($List) {
    foreach ($s in $mgr.GetSessions()) { $s.SourceAppUserModelId }
    exit 0
}

# ---- commands from mochi arrive on stdin; read them on a background thread ----
$queue = New-Object System.Collections.Concurrent.ConcurrentQueue[string]
$state = [hashtable]::Synchronized(@{ open = $true })
$rs = [runspacefactory]::CreateRunspace()
$rs.Open()
$rs.SessionStateProxy.SetVariable('queue', $queue)
$rs.SessionStateProxy.SetVariable('state', $state)
$reader = [powershell]::Create()
$reader.Runspace = $rs
[void]$reader.AddScript({
    while ($null -ne ($line = [Console]::In.ReadLine())) { $queue.Enqueue($line.Trim()) }
    $state.open = $false
})
[void]$reader.BeginInvoke()

function Get-Session {
    $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -match $Match } | Select-Object -First 1
}

# PowerShell 5.1 cannot cast the WinRT stream to a .NET type, so the converter is called by reflection
# (which skips PowerShell's type binder).
$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Get-Art($props) {
    try {
        if (-not $props.Thumbnail) { return $null }
        $ras = (Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType]))[0]
        $stream = $asStreamForRead.Invoke($null, @($ras))
        $ms = New-Object System.IO.MemoryStream
        $stream.CopyTo($ms)
        $bytes = $ms.ToArray()
        if ($bytes.Length -lt 4 -or $bytes.Length -gt 4MB) { return $null }
        $type = if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { 'image/png' } else { 'image/jpeg' }
        return "data:$type;base64," + [Convert]::ToBase64String($bytes)
    } catch { return $null }
}

function Send($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

$lastKey = ''
$lastArtKey = ''
$lastArtLen = 0     # size of the artwork last sent: a different size means the real cover arrived
$artChecks = 0      # periodic re-checks left for the current track
$lastEmit = [DateTime]::MinValue

while ($state.open) {
    $session = Get-Session

    # run queued commands against the Apple Music session only
    $cmd = $null
    while ($queue.TryDequeue([ref]$cmd)) {
        if (-not $session) { continue }
        try {
            switch ($cmd) {
                'playpause' { [void](Await ($session.TryTogglePlayPauseAsync()) ([bool]))[0] }
                'next'      { [void](Await ($session.TrySkipNextAsync()) ([bool]))[0] }
                'prev'      { [void](Await ($session.TrySkipPreviousAsync()) ([bool]))[0] }
            }
        } catch { }
        $lastKey = ''   # force an immediate update after a command
    }

    if (-not $session) {
        if ($lastKey -ne 'none') { Send @{ status = 'none' }; $lastKey = 'none'; $lastArtKey = '' }
    } else {
        try {
            $props = (Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]))[0]
            $info = $session.GetPlaybackInfo()
            $tl = $session.GetTimelineProperties()
            $status = switch ($info.PlaybackStatus.ToString()) { 'Playing' { 'playing' } 'Paused' { 'paused' } default { 'stopped' } }
            $title = [string]$props.Title
            $artist = [string]$props.Artist
            $album = [string]$props.AlbumTitle
            # Apple Music reports "Artist <em dash> Album" in the artist field
            $parts = $artist -split ([string][char]0x2014), 2
            if ($parts.Count -eq 2 -and -not $album) { $artist = $parts[0].Trim(); $album = $parts[1].Trim() }
            $artKey = "$title|$artist|$album"
            $key = "$status|$artKey"
            $due = ([DateTime]::UtcNow - $lastEmit).TotalSeconds -ge 5   # periodic timeline resync

            # Apple Music can report a placeholder first and the real cover a moment later:
            # re-read the artwork on the periodic resyncs for the first minute of a track
            $newArt = $null
            if ($key -eq $lastKey -and $due -and $artChecks -gt 0) {
                $artChecks--
                $candidate = Get-Art $props
                if ($candidate -and $candidate.Length -ne $lastArtLen) { $newArt = $candidate }
            }

            if ($key -ne $lastKey -or $due) {
                $msg = @{
                    status   = $status
                    title    = $title
                    artist   = $artist
                    album    = $album
                    artKey   = $artKey
                    position = [math]::Round($tl.Position.TotalSeconds, 1)
                    duration = [math]::Round(($tl.EndTime - $tl.StartTime).TotalSeconds, 1)
                    at       = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                }
                if ($artKey -ne $lastArtKey) {
                    $msg.art = Get-Art $props
                    $lastArtKey = $artKey
                    $artChecks = 12
                } elseif ($newArt) {
                    $msg.art = $newArt
                }
                if ($msg.ContainsKey('art') -and $msg.art) { $lastArtLen = $msg.art.Length }
                Send $msg
                $lastKey = $key
                $lastEmit = [DateTime]::UtcNow
            }
        } catch { }
    }
    Start-Sleep -Milliseconds 500
}

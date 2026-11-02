# mochi

A small notch fused to the top-centre edge of your primary display (Windows 10/11). It shows what
Claude Code is doing, lets you allow or deny actions, and houses a mascot called Mochi.
Personal use, local only: nothing leaves your machine.

- **Idle:** glowing eyes. Hover to open Home (date, Claude / Music / Focus tiles).
- **Working:** orange eyes. Hover to see the project, a live timer, the current step and what is being edited.
- **Needs you:** opens by itself with the command and **Allow** / **Deny** buttons.
- **Done:** opens by itself, Mochi celebrates and shows Claude's final message.

## Requirements

- Windows 10 or 11
- Node.js 20 or newer (`node --version`)
- Claude Code (hooks need a version that supports `PermissionRequest`; tested on 2.1.316)
- Optional: the Apple Music desktop app for the Music tile

## Install

```powershell
cd C:\Users\Lenovo\mochi
npm install
```

If `npm start` later says the Electron binary is missing, run `node node_modules\electron\install.js` once.

### Connect Claude Code (hooks)

mochi gets its events from hooks in `~/.claude/settings.json`. The installer **merges** (it never
overwrites), writes a backup to `%APPDATA%\mochi\backups\`, shows you the diff and asks `y/N`:

```powershell
npm run hooks:install -- --dry-run   # just show the diff
npm run hooks:install                # show the diff, ask, then apply
```

It adds hooks for `PreToolUse`, `PostToolUse`, `Notification`, `Stop` and `PermissionRequest`
(all run `hooks\send-event.ps1`), plus a `statusLine` that records your plan usage. Any status line you
already had is saved and still runs. **Restart running Claude Code sessions** afterwards: hooks are read at start.

## Run

```powershell
npm start
```

The tray icon (bottom right, maybe under the `^` arrow) has the settings. Leave the window open while mochi runs.

### What happens on an approval

`PermissionRequest` holds until you press **Allow** or **Deny** in the notch. If you do not answer
within about 100 seconds, or you answer in Claude Code's own prompt, mochi steps aside and Claude Code
asks as usual. If mochi is not running the hooks do nothing at all, so Claude Code is never blocked.

## Tray settings

| Setting | What it does |
|---|---|
| Pause notch (Ctrl+Alt+M) | Hides the notch; no panels, sounds or toasts until you unpause |
| Hide while gaming | Hides the notch while Valorant or Dota 2 is the active window (list: `games` in `src/theme.js`) |
| Sounds | Soft chime on Done, Needs you and Focus finished |
| Show usage on Claude tile | 5h / Week plan bars (or an approximate token count) |
| Music module | Apple Music now-playing and controls |
| Launch on startup | Starts mochi when you sign in |
| Motion | Subtle (default) or Lively (scanning eyes, sweep line, typing dots, lean-in) |
| Monitor | Which display the notch sits on |
| Preview state | Shows each panel with sample data, to see how it looks |

Everything visual (colours, sizes, radii, timings, game list, chime notes) lives in **`src/theme.js`**.
Set `notchGlow` there to `true` for a soft glow (off by default).

### Usage bars

The 5h / Week bars come from the `rate_limits` Claude Code sends to its status line. That only runs in
terminal `claude` sessions, **not** in the desktop Code tab, and the numbers appear after the first reply of a
session. Until then, or on API-key billing, the tile shows an approximate "tokens today" count taken from
`~/.claude/projects` logs (read-only; only the usage numbers are read, never message content).

### Notifications

Windows toasts need notifications switched on in Windows (Settings, System, Notifications). The chime
does not depend on that.

## Tests

```powershell
npm test
```

## Troubleshooting

- **Nothing reacts to Claude:** restart mochi, then start a *new* Claude Code session. Check the server:
  `Get-Content $env:APPDATA\mochi\config.json` has a `port`; `hooks:install` must have been applied.
- **The notch shows the wrong state:** restart mochi. For tests only, `npm start -- --preview-state=needs`.
- **No usage bars:** run `claude` in a normal terminal and send two messages; see "Usage bars" above.
- **Second `npm start`:** a second copy exits immediately; use the tray's Quit first if you want a clean restart.

## Uninstall

1. **Remove the hooks** (restores your original status line too):
   ```powershell
   cd C:\Users\Lenovo\mochi
   npm run hooks:uninstall
   ```
   It shows the diff and asks `y/N`. **By hand instead:** open `%USERPROFILE%\.claude\settings.json`, delete every
   hook entry whose command contains `send-event.ps1` (under `PreToolUse`, `PostToolUse`, `Notification`,
   `Stop` and `PermissionRequest`, and any now-empty event), and replace the `statusLine` pointing at
   `hooks\statusline.js` with your old one (it is saved as `statusLineOriginal` in `%APPDATA%\mochi\config.json`).
   Backups of every change are in `%APPDATA%\mochi\backups\`.
2. **Quit mochi** from the tray icon.
3. **Startup entry:** untick *Launch on startup* in the tray menu before quitting.
4. **Delete the data and the app:**
   ```powershell
   Remove-Item -Recurse -Force $env:APPDATA\mochi
   Remove-Item -Recurse -Force C:\Users\Lenovo\mochi
   ```

## Security notes

- The server listens on `127.0.0.1` only (never the network) and every request needs the random token
  stored in `%APPDATA%\mochi\config.json`. Requests from a browser (with an `Origin`) are refused.
- The hook script, the status line script and the helpers only read what is listed above. Window
  titles and content are never read; game detection only reads the active program's name.

## Files

```
src/theme.js          every colour, size, radius, timing, game list, motion option
src/main/             window, tray, server, session state, usage, music, game mode, toasts
src/renderer/         notch UI: components (Mochi, laptop scene, progress, chime) and views
hooks/                send-event.ps1 (hook script), statusline.js (plan usage capture)
helpers/              media.ps1 (Apple Music), foreground.ps1 (active program name)
scripts/              hooks.js (install/uninstall), fake-events.ps1, make-icon.js, self tests
```

To try states without Claude, with mochi running:

```powershell
.\scripts\fake-events.ps1 -Scenario work
.\scripts\fake-events.ps1 -Scenario approval
.\scripts\fake-events.ps1 -Scenario done
```

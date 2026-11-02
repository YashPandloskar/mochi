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

## The nav bar

The pill at the bottom of the panel switches the view. Click an icon:

| Tab | Shows |
|---|---|
| Home | Date, time and the Claude / Music / Focus tiles |
| Claude | The live work panel (timer, step, diff, progress) or, when idle, your last job and its message |
| Music | A bigger Apple Music player: art, title, artist, progress with times, previous / play-pause / next. The panel takes the album's colour |
| Chat | Day-to-day questions to Claude: plan something, explain something, draft a message (see below) |
| Focus | The countdown with a progress ring (shared with the Focus tile). **− / +** change the length in 5 minute steps (5 to 120, remembered); locked while counting. Default 25: `home.focusMinutes` in `src/theme.js` |

The panel opens on Home when idle and on Claude while a job runs or has just finished. Needs-you always
takes over (it has no nav bar). The nav bar can be taken off the Working and Done panels with
`nav.onPanels: false` in `src/theme.js` (they then go back to heights 200 and 214).

## Chat

The **Chat** tab (message icon) is a plain conversation with Claude for everyday questions. Click the input, type, press **Enter** (Shift+Enter for a new line). **Stop** ends an answer early, **New chat** starts over, and the suggestion chips fill the input for you.

- **How it works:** each message runs your own Claude Code (`claude -p`) in the background, so it uses **your login and your plan**; no API key and nothing else is installed. Answers count against your normal Claude usage limits.
- **Memory:** the conversation continues until you press New chat. The notch reopens on Chat if you chatted in the last 10 minutes.
- **Plain chat only:** tools are off (it cannot read files or run commands), and your personal Claude Code settings, plugins and hooks are not loaded, so a chat never shows up as a Working / Done job and never counts toward "jobs today". It runs in an empty temporary folder.
- **Keyboard focus:** the notch normally never takes keyboard focus. It takes it only when you click the input, and gives it back when you press **Esc**, click another window, or the notch closes. While you type or an answer arrives, the panel stays open.
- **Not signed in?** Run `claude` once in a terminal and sign in.
- **Explain my screen:** the camera button next to Send takes a screenshot of the display the notch is on. A thumbnail appears above the input with an ✕ to remove it; then type your question (or just press Enter to ask "Explain what is on my screen.") and it is sent together with the picture. The notch's own window is left out of the picture. A screenshot is taken **only when you press the button**, is kept in memory only until you send or remove it, and is never saved by mochi (Claude Code keeps its own record of the conversation, as it does for any chat). The picture is scaled to at most 1600 pixels wide. Apps that block screenshots come out black, and mochi tells you. The "Explain my screen" suggestion does both steps for you.
- Answers are shown as formatted text (lists, bold, code blocks). Anything that looks like HTML is displayed as plain text, never run.

## While the notch is collapsed

- **Focus timer running:** the notch widens: a purple progress ring on the left, the eyes in the middle,
  the time left on the right. It shrinks back when the timer ends or is reset.
- **Apple Music playing or paused:** a small round album-art bubble sits beside the notch (dimmed while paused).
  It is purely visual, so clicks go through it.

Both hide while the panel is open, and while game mode or Pause has the notch hidden.

## Mochi's personality

All of it can be switched off with **Mochi personality** in the tray menu. Times and values are in `personality` in `src/theme.js`.

- **Nap:** after 10 idle minutes (nothing happening, not hovered, no timer, no music) his eyes slowly close and a tiny "z" drifts up. Anything that happens wakes him with a blink.
- **Dancing:** while Apple Music plays he sways gently: the collapsed eyes, the little Mochi on Home and the one on the Music tab. It is a steady, gentle rhythm, not synced to the beat (Apple Music does not share the tempo).
- **Break reminders:** after about 50 minutes of continuous Claude work (a gap of 5 minutes ends it) a green panel opens with a stretch / 20-20-20 suggestion. **Eye rest** runs a 20 second countdown, **Later** asks again in 10 minutes, **Skip** dismisses. Ignored for a minute it counts as Later. Nothing is shown while paused or while a game is in front.
- **Time of day:** droopy, slower eyes from 23:00 to 05:00 and wider, livelier eyes from 06:00 to 10:00.
- **Milestone:** when "jobs today" reaches 5, 10, 15, 20, 30, 40 or 50 the Done panel adds a "★ 5th job today" badge and extra confetti.

The tray's **Preview personality** menu shows nap, wake, the break reminder and the night / morning looks without waiting.

## Tray settings

| Setting | What it does |
|---|---|
| Pause notch (Ctrl+Alt+M) | Hides the notch; no panels, sounds or toasts until you unpause |
| Hide while gaming | Hides the notch while Valorant or Dota 2 is the active window (list: `games` in `src/theme.js`) |
| Mochi personality | Nap, dancing, break reminders, time-of-day looks, milestones |
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
src/renderer/         notch UI: components (Mochi, laptop scene, nav, progress, focus, chime) and views
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

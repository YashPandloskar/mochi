# Mochi

A small notch at the top-centre of your screen (Windows 10/11) that shows what Claude Code is doing, lets you allow or deny its actions, and has a little mascot called Mochi. It also has Apple Music controls, a Focus timer, a to-do list, and a chat with Claude, Gemini, ChatGPT or a local model.

Everything runs on your own PC. Nothing is sent to us.

- **Idle:** glowing eyes. Hover to open Home (date, Claude / Music / Focus tiles).
- **Working:** orange eyes. Hover to see the project, a live timer and the current step.
- **Needs you:** opens by itself with **Allow** / **Deny** buttons.
- **Done:** opens by itself and Mochi celebrates.

## Install (3 steps)

1. Go to the **Releases** page of this repository and download **Mochi-Setup-x.y.z.exe**.
2. Double-click it. Windows may say **"Windows protected your PC"** because the app is new and not yet signed. Click **More info**, then **Run anyway**. It installs for you only and does not need admin rights.
3. Mochi opens at the top of your screen. Its settings are in the tray icon (bottom right, maybe under the `^` arrow).

That's it. Hover over the notch to open it.

### Use it with Claude Code (optional)

Right-click the tray icon, choose **Claude Code connection**, then **Connect to Claude Code**. A backup of your Claude settings is made first. Then start a new Claude Code session. Mochi shows what it is doing and asks you to allow or deny actions. The usage bars also need [Node.js](https://nodejs.org) installed.

### Chat with other AIs (optional)

Open the **Chat** tab (message icon) and click the name at the top to pick who answers:

- **Claude:** uses your Claude Code login, no key needed.
- **Gemini:** paste a free key from [Google AI Studio](https://aistudio.google.com/apikey).
- **ChatGPT:** paste an OpenAI API key. This is billed by OpenAI per use, separately from a ChatGPT subscription.
- **Local (Ollama):** free and private, but you need [Ollama](https://ollama.com) installed.

Keys are encrypted by Windows and stay on your PC. Remove one from the same menu.

### Is it safe?

- It only listens on your own computer (127.0.0.1) and uses a private token.
- Your notes, settings and keys are in `C:\Users\<you>\.mochi`. They are never uploaded by Mochi.
- Chat messages go only to the AI you chose. Screenshots are taken only when you press the camera button.
- The installer is **unsigned** for now, which is why Windows warns you.

### Uninstall

Windows **Settings > Apps > Installed apps > Mochi > Uninstall**. Your notes and settings stay in `.mochi`; delete that folder too if you want everything gone. If you connected Claude Code, choose **Disconnect from Claude Code** in the tray first.

### Something wrong?

Mochi keeps a log at `C:\Users\<you>\.mochi\mochi.log`. Open an issue on this repository and attach it. Quitting from the tray and opening Mochi again fixes most things.

---

# For developers

## Requirements (running from source)

- Windows 10 or 11
- Node.js 20 or newer (`node --version`)
- Claude Code (hooks need a version that supports `PermissionRequest`; tested on 2.1.316)
- Optional: the Apple Music desktop app for the Music tile

## Run from source

```powershell
git clone <this repository>
cd mochi
npm install
npm start
```

If `npm start` later says the Electron binary is missing, run `node node_modules\electron\install.js` once.

### Connect Claude Code (hooks)

mochi gets its events from hooks in `~/.claude/settings.json`. The installer **merges** (it never
overwrites), writes a backup to `%USERPROFILE%\.mochi\backups\`, shows you the diff and asks `y/N`:

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
| Notes | A to-do list and a quick note, kept in a Markdown file (see "Notes and to-do" below) |
| Chat | Day-to-day questions to Claude: plan something, explain something, draft a message (see below) |
| Focus | A Pomodoro timer with a progress ring: **25 minutes of focus, then a 5 minute break, then focus again**, until you press Reset. **- / +** change the focus length (5 to 120, steps of 5) and the break length (1 to 30). **Cycle** turns the repeating off for a single timer. Each finished focus period counts as a session; today's count is shown on the tile and the tab and is remembered for the day. A soft chime and a toast mark every switch (a falling tune for "break", a rising one for "back to focus"). The collapsed notch widens with a ring and the time (green during a break). Lengths are locked while counting. Defaults: `home.focusMinutes`, `home.breakMinutes`, `home.cycle` in `src/theme.js` |

The panel opens on Home when idle and on Claude while a job runs or has just finished. Needs-you always
takes over (it has no nav bar). The nav bar can be taken off the Working and Done panels with
`nav.onPanels: false` in `src/theme.js` (they then go back to heights 200 and 214).

## Notes and to-do

The **Notes** tab (checklist icon) has a to-do list on the left and a quick note on the right. A strip under the Home tiles shows how far you are ("To-do · 2 of 5") and your next task; click it to open the tab.

- **Tasks:** type in "Add a task…" and press Enter. Click the box to tick a task, double-click its text to rename it (an emptied task is deleted), use the ? to delete, and **Clear done** removes the ticked ones.
- **Nothing typed is lost:** a task you typed but did not confirm with Enter is added as soon as you click away, switch tab or the notch closes. **Esc** cancels instead. Every change is written to the file immediately; if Windows refuses a write, mochi retries and shows a red warning in the Notes tab until it succeeds.
- **Quick note:** just type; it is saved a moment after you stop.
- **It is a plain file:** `%USERPROFILE%\.mochi\notes.md`. **Open file** opens it in your editor, and changes made there appear in the notch within a second. The format is simple:

  ```
  # mochi notes

  ## To-do
  - [ ] buy milk
  - [x] send the report

  ## Note
  anything you like
  ```

  Other bullet styles (`- task`, `* [x] task`, `[ ] task`) and headings called Tasks / Notes also work. Anything you write under `## Note` is kept as the note. Change the file's location with `notesFile` in `%USERPROFILE%\.mochi\config.json`.
- **Keyboard focus:** like Chat, the notch takes keyboard focus only while you click into a text box, gives it back on **Esc**, and stays open while you type. Nothing leaves your computer.
- Limits: 200 tasks, 500 characters per task, 50,000 characters of note.

## Chat

The **Chat** tab (message icon) is a plain conversation with Claude for everyday questions. Click the input, type, press **Enter** (Shift+Enter for a new line). **Stop** ends an answer early, **New chat** starts over, and the suggestion chips fill the input for you.

- **How it works:** each message runs your own Claude Code (`claude -p`) in the background, so it uses **your login and your plan**; no API key and nothing else is installed. Answers count against your normal Claude usage limits.
- **Memory:** the conversation continues until you press New chat. The notch reopens on Chat if you chatted in the last 10 minutes.
- **Plain chat only:** tools are off (it cannot read files or run commands), and your personal Claude Code settings, plugins and hooks are not loaded, so a chat never shows up as a Working / Done job and never counts toward "jobs today". It runs in an empty temporary folder.
- **Keyboard focus:** the notch normally never takes keyboard focus. It takes it only when you click the input, and gives it back when you press **Esc**, click another window, or the notch closes. While you type or an answer arrives, the panel stays open.
- **Not signed in?** Run `claude` once in a terminal and sign in.
- **Explain my screen:** the camera button next to Send takes a screenshot of the display the notch is on. A thumbnail appears above the input with an ? to remove it; then type your question (or just press Enter to ask "Explain what is on my screen.") and it is sent together with the picture. The notch's own window is left out of the picture. A screenshot is taken **only when you press the button**, is kept in memory only until you send or remove it, and is never saved by mochi (Claude Code keeps its own record of the conversation, as it does for any chat). The picture is scaled to at most 1600 pixels wide. Apps that block screenshots come out black, and mochi tells you. The "Explain my screen" suggestion does both steps for you.
- Answers are shown as formatted text (lists, bold, code blocks). Anything that looks like HTML is displayed as plain text, never run.

### Other chat models, and any other tool

Click the model name at the top of the Chat tab (or use the tray's **Chat with** menu) to pick who answers:

- **Claude** (default): as above, through your Claude Code login.
- **Gemini** (free key from Google AI Studio), **ChatGPT / OpenAI** (API key), **Local (Ollama)** (no key; Ollama must be running on this PC). For Gemini and OpenAI a card asks you to paste the key; **Get a key** opens the right page.
- **Keys** are encrypted by Windows (DPAPI) in `~\.mochi\keys.json`, are never sent back to the interface, and are only ever sent to that model's own service. If Windows encryption is unavailable, keys are refused rather than stored in plain text. Remove a key from the same menu.
- **Models:** defaults are `gemini-2.5-flash`, `gpt-4o-mini` and `llama3.2`. To use another, add `"providerModels": { "gemini": "model-name" }` to `~\.mochi\config.json`.
- The notch reacts to chats like it does to Claude Code: thinking, replying, done, or error, with a small chip beside the notch naming the model. Chat answers no longer hold the notch open, so you can carry on working and it chimes when the answer is ready.
- **What I use** (tray): **Both** (default, the interface is unchanged), **Claude Code only**, or **Chat only** (the Claude Code tile becomes an **Assistant** tile and the Claude tab is called Assistant).
- **Ping from any tool:** `.\scripts\mochi-ping.ps1 working -Label "Cursor" -Message "Refactoring"` (states: working, needs, done, idle, error) sets the notch for any tool that can run a command. It posts to `POST /ping` on 127.0.0.1 with the same private token as the hooks.
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
- **Milestone:** when "jobs today" reaches 5, 10, 15, 20, 30, 40 or 50 the Done panel adds a "? 5th job today" badge and extra confetti.

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

## Build an installer

```
npm run dist
```

This writes `dist\Mochi-Setup-<version>.exe` (a per-user installer, no admin needed). Notes:

- **Signing:** the installer is unsigned unless you provide a code-signing certificate (set `CSC_LINK` and `CSC_KEY_PASSWORD` before building, or the `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` secrets in GitHub). Unsigned installers show a Windows SmartScreen warning.
- **No asar:** the app is packed as plain files, because Claude Code and PowerShell run the hook and helper scripts from disk.
- **Connect to Claude Code:** an installed copy has no `npm`, so use the tray's **Claude Code connection** menu to install or remove the hooks (a backup of `settings.json` is made first). The status line script runs with `node`, so Node.js must be installed for the usage bars.
- **CI:** `.github/workflows/build.yml` runs the tests and builds the installer on every push, and attaches it to a GitHub release for tags like `v0.2.0`.
- The icon is generated by `node scripts/make-app-icon.js`.
## Tests

```powershell
npm test
```

## Troubleshooting

- **Nothing reacts to Claude:** restart mochi, then start a *new* Claude Code session. Check the server:
  `Get-Content $env:USERPROFILE\.mochi\config.json` has a `port`; `hooks:install` must have been applied.
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
   `hooks\statusline.js` with your old one (it is saved as `statusLineOriginal` in `%USERPROFILE%\.mochi\config.json`).
   Backups of every change are in `%USERPROFILE%\.mochi\backups\`.
2. **Quit mochi** from the tray icon.
3. **Startup entry:** untick *Launch on startup* in the tray menu before quitting.
4. **Delete the data and the app:**
   ```powershell
   Remove-Item -Recurse -Force $env:USERPROFILE\.mochi
   Remove-Item -Recurse -Force C:\Users\Lenovo\mochi
   ```

## Security notes

- The server listens on `127.0.0.1` only (never the network) and every request needs the random token
  stored in `%USERPROFILE%\.mochi\config.json`. Requests from a browser (with an `Origin`) are refused.
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

## If something misbehaves

- Mochi writes anything that went wrong to `%USERPROFILE%\.mochi\mochi.log` (errors in the notch, a crashed or frozen
  window, mouse presses that did not arrive). If the notch ever stops reacting to clicks it rebuilds its own window
  after two dropped presses in a row, and a crashed or hung page is rebuilt automatically.
- `npm run soak` drives the real notch with a real mouse and keyboard for about six minutes (tabs, pause and resume,
  the Focus timer, typing in Notes and Chat, a Claude job passing through, quick flicks across the notch) and checks
  every result. It uses its own notes file, so your notes are untouched. Run it after changing anything in `src\`.
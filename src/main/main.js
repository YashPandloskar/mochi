const { app, ipcMain, globalShortcut, shell, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const theme = require('../theme');
const config = require('./config');
const windowMgr = require('./window');
const tray = require('./tray');
const server = require('./server');
const SessionState = require('./session-state');
const Usage = require('./usage');
const Music = require('./music');
const GameMode = require('./gamemode');
const notify = require('./notify');
const BreakTimer = require('./breaks');
const Chat = require('./chat');
const Keys = require('./keys');
const { Gemini, OpenAI, Ollama, META } = require('./providers');
const ChatHub = require('./chat-hub');
const Activity = require('./activity');
const screenshot = require('./screenshot');
const Notes = require('./notes');

// An error nobody caught must not pop up Electron's crash dialog or stop mochi: it goes to ~/.mochi/mochi.log.
process.on('uncaughtException', (e) => windowMgr.log(`uncaught exception: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => windowMgr.log(`unhandled rejection: ${e && e.stack ? e.stack : e}`));

app.setName('mochi');
// Windows toasts need an app identity; an unpackaged Electron app uses its own executable path.
app.setAppUserModelId(app.isPackaged ? 'mochi' : process.execPath);
// A second copy must do nothing at all: no window, no server, no config writes.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);

app.whenReady().then(() => {
  if (!gotLock) return;
  const cfg = config.load();

  // ---------- settings (persisted in %APPDATA%\mochi\config.json) ----------
  const settings = {
    paused: false, // not persisted: a restart always starts unpaused
    gameMode: cfg.gameMode,
    personality: cfg.personality,
    sounds: cfg.sounds,
    showUsage: cfg.showUsage,
    music: cfg.music,
    startup: app.getLoginItemSettings().openAtLogin,
    motion: cfg.motion || theme.motion,
    focusMinutes: cfg.focusMinutes,
    breakMinutes: cfg.focusBreakMinutes,
    focusCycle: cfg.focusCycle,
    focusSessions: cfg.focusSessions,
    monitor: cfg.monitor,
    assistantMode: ['both', 'claudeCode', 'chatOnly'].includes(cfg.assistantMode) ? cfg.assistantMode : 'both',
    chatProvider: 'claude', // set from the chat hub below
  };

  ipcMain.on('theme:get', (e) => {
    e.returnValue = { ...theme, motion: settings.motion };
  });
  ipcMain.on('hit:size', (_e, size) => windowMgr.setHitSize(size));

  const state = new SessionState({ jobs: cfg.jobs, onJobs: (jobs) => config.update({ jobs }) });
  const usage = new Usage({ dir: config.configDir(), enabled: settings.showUsage });
  const music = new Music({ enabled: settings.music });
  const game = new GameMode({ enabled: settings.gameMode });
  // Dev aid: `npm start -- --games=notepad.exe` replaces the game list (to try game mode without a game).
  const gamesFlag = process.argv.find((a) => a.startsWith('--games='));
  if (gamesFlag) game.games = new Set(gamesFlag.slice(8).toLowerCase().split(','));

  const win = windowMgr.create(cfg);

  // ---------- quiet: paused, or a game is the active window ----------
  let missedDone = false;
  const quiet = () => settings.paused || game.active;

  function applyQuiet() {
    // visibility.log: every show/hide with its reason, to find out why the notch is not on screen
    try {
      require('fs').appendFileSync(
        require('path').join(config.configDir(), 'visibility.log'),
        `${new Date().toISOString()} visible=${!quiet()} paused=${settings.paused} game=${game.active} exe=${game.exe}
`
      );
    } catch {}
    windowMgr.setVisible(!quiet());
    if (!quiet() && missedDone) {
      missedDone = false;
      state.replayDone(); // show the Done that finished while the notch was hidden
    }
  }
  game.on('change', applyQuiet);

  // ---------- sounds and toasts on Done / Needs you ----------
  let prev = { state: 'idle', approvalId: null };
  function maybeNotify(snap) {
    if (snap.preview) return;
    const approvalId = snap.approval ? snap.approval.id : null;
    const newDone = snap.state === 'done' && prev.state !== 'done';
    const newNeeds = snap.state === 'needs' && (prev.state !== 'needs' || approvalId !== prev.approvalId);
    prev = { state: snap.state, approvalId };
    const kind = newDone ? 'done' : newNeeds ? 'needs' : null;
    if (!kind) return;
    if (quiet()) {
      if (kind === 'done') missedDone = true;
      return;
    }
    if (settings.sounds) windowMgr.send('chime', kind);
    notify.toast(kind, snap);
  }

  state.on('change', (snap) => {
    windowMgr.send('state', snap.state);
    windowMgr.send('session', snap);
    maybeNotify(snap);
  });
  // ---------- break reminders ----------
  const breaks = new BreakTimer({ canFire: () => settings.personality && !quiet() });
  state.on('activity', () => breaks.activity());
  breaks.on('due', (info) => {
    windowMgr.send('break', info);
    if (settings.sounds) windowMgr.send('chime', 'break');
    notify.toast('break', {});
  });
  ipcMain.on('break:answer', (_e, action) => (action === 'snooze' ? breaks.snooze() : breaks.done()));

  usage.on('change', (u) => windowMgr.send('usage', u));
  music.on('change', (m) => windowMgr.send('music', m));

  const pushSettings = () =>
    windowMgr.send('settings', {
      motion: settings.motion,
      sounds: settings.sounds,
      focusMinutes: settings.focusMinutes,
      breakMinutes: settings.breakMinutes,
      cycle: settings.focusCycle,
      focusSessions: settings.focusSessions,
      personality: settings.personality,
      assistantMode: settings.assistantMode,
      chatProvider: settings.chatProvider,
      providerLabel: hub.info().label,
    });
  // for this window and for any the window manager rebuilds later (crash recovery)
  windowMgr.whenCreated((w) =>
    w.webContents.on('did-finish-load', () => {
      const snap = state.snapshot();
      windowMgr.send('state', snap.state);
      windowMgr.send('session', snap);
      if (usage.current) windowMgr.send('usage', usage.current);
      windowMgr.send('music', music.current);
      pushNotes();
      pushSettings();
      pushProviders();
      pushAssistant();
    })
  );
  ipcMain.on('window:press-dropped', () => windowMgr.pressDropped());

  // ---------- notes and to-do: one Markdown file, also editable outside mochi ----------
  // MOCHI_NOTES_FILE lets a test copy use a scratch file instead of your real notes
  const notes = new Notes({ file: process.env.MOCHI_NOTES_FILE || cfg.notesFile || path.join(config.configDir(), 'notes.md') });
  let notesData = { todos: [], note: '' };
  // Until the file has been read successfully nothing is ever written back (an empty list must not replace a real one).
  let notesLoaded = false;
  let notesLoadTimer = null;
  const logNotesError = (msg) => {
    console.error('notes:', msg);
    try {
      fs.appendFileSync(path.join(config.configDir(), 'notes-error.log'), `${new Date().toISOString()} ${msg}\n`);
    } catch {}
  };
  const loadNotes = () => {
    if (notesLoaded) return true;
    try {
      notesData = notes.load();
      notesLoaded = true;
      clearTimeout(notesLoadTimer);
      return true;
    } catch (e) {
      logNotesError('could not read ' + notes.file + ': ' + (e.code || e.message));
      clearTimeout(notesLoadTimer);
      notesLoadTimer = setTimeout(() => {
        if (loadNotes()) pushNotes(); // the file became readable (just after login, say): show it
      }, 3000);
      return false;
    }
  };
  loadNotes();
  const pushNotes = () => windowMgr.send('notes', { ...notesData, file: notes.file });
  ipcMain.handle('notes:get', () => {
    loadNotes();
    return { ...notesData, file: notes.file };
  });
  notes.on('external', (d) => {
    notesData = d;
    pushNotes();
  });
  notes.watch();
  // A failed save is reported to the Notes tab (so you know) and retried a few times on its own.
  let notesRetry = null;
  let notesFailing = false;
  const saveNotes = (data, tries = 0) => {
    clearTimeout(notesRetry);
    try {
      if (!loadNotes()) throw Object.assign(new Error('notes file not readable yet'), { code: 'NOTREAD' });
      notes.save(data);
      notesData = Notes.clean(data);
      if (notesFailing) {
        notesFailing = false;
        windowMgr.send('notes:status', { ok: true });
      }
    } catch (e) {
      console.error('notes save failed:', e.code || e.message);
      notesFailing = true;
      windowMgr.send('notes:status', { ok: false, message: e.code || e.message });
      if (tries < 4) notesRetry = setTimeout(() => saveNotes(data, tries + 1), 2000 * (tries + 1));
    }
  };
  ipcMain.on('notes:save', (_e, data) => saveNotes(data));
  ipcMain.on('notes:open', () => shell.openPath(notes.file));

  // ---------- chat (Claude through your own Claude Code login) ----------
  // The Claude chat is unchanged (src/main/chat.js); the hub lets the same Chat tab talk to other models too.
  const chat = new Chat();
  const models = { ...theme.chat.models, ...(cfg.providerModels || {}) };
  const keys = new Keys({ file: path.join(config.configDir(), 'keys.json'), safeStorage });
  const providers = {
    claude: chat,
    gemini: new Gemini({ model: models.gemini, getKey: () => keys.get('gemini') }),
    openai: new OpenAI({ model: models.openai, getKey: () => keys.get('openai') }),
    ollama: new Ollama({ model: models.ollama }),
  };
  const hub = new ChatHub({ providers, current: cfg.chatProvider, keys, models });
  settings.chatProvider = hub.current;

  // What the assistant side is doing (a chat request, or a ping from another tool) is tracked apart from Claude Code.
  const activity = new Activity({ chats: cfg.chatsToday, onChats: (chatsToday) => config.update({ chatsToday }) });
  const pushAssistant = () => windowMgr.send('assistant', { ...activity.snapshot(), quiet: quiet(), sounds: settings.sounds });
  activity.on('change', pushAssistant);
  const pushProviders = () => windowMgr.send('chat:providers', hub.list());
  hub.on('event', (ev) => {
    if (ev && ev.type === 'error' && ev.detail) windowMgr.log('chat error: ' + ev.detail); // the key is never part of this text
    windowMgr.send('chat', ev);
    activity.chat(ev, hub.info().label);
  });
  ipcMain.on('chat:send', (_e, arg) => {
    if (typeof arg === 'string') hub.send(arg);
    else if (arg && typeof arg.text === 'string') hub.send(arg.text, arg.image);
  });
  ipcMain.handle('chat:providers', () => hub.list());
  ipcMain.handle('chat:set-provider', (_e, id) => {
    const ok = typeof id === 'string' && hub.setCurrent(id);
    if (ok) {
      settings.chatProvider = hub.current;
      config.update({ chatProvider: hub.current });
      pushSettings();
      pushProviders();
    }
    return ok;
  });
  // the key is handed over once, stored encrypted, and never comes back to the page
  ipcMain.handle('chat:set-key', (_e, id, key) => {
    if (!['gemini', 'openai'].includes(id)) return { ok: false, error: 'That model does not use a key.' };
    try {
      keys.set(id, key);
      pushProviders();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  // only the fixed key-creation pages listed in providers.js can be opened, never an address from the page
  ipcMain.on('chat:open-key-page', (_e, id) => {
    const url = typeof id === 'string' && META[id] && META[id].keyUrl;
    if (url) shell.openExternal(url);
  });
  ipcMain.handle('chat:remove-key', (_e, id) => {
    if (['gemini', 'openai'].includes(id)) keys.remove(id);
    pushProviders();
    return { ok: true };
  });
  // a screenshot is taken only when the camera button is pressed, and is never saved by mochi
  ipcMain.handle('chat:capture', () => screenshot.capture(windowMgr.current()));
  ipcMain.on('chat:stop', () => hub.stop());
  ipcMain.on('chat:new', () => hub.reset());
  ipcMain.on('window:focus', (_e, on) => windowMgr.setFocus(!!on));

  // ---------- renderer requests ----------
  ipcMain.on('music:command', (_e, cmd) => (cmd === 'open' ? music.open() : music.command(cmd)));
  // Allow / Deny buttons in the notch. id -1 is the tray "Preview state" sample: just close it.
  ipcMain.on('approval:resolve', (_e, { id, decision }) => {
    if (decision !== 'allow' && decision !== 'deny') return;
    if (id === -1) state.preview(null);
    else state.resolve(id, decision);
  });
  // Focus / Pomodoro: the notch window runs the timer; main saves its settings and plays the chimes
  const H = theme.home;
  const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  ipcMain.on('focus:config', (_e, c) => {
    if (!c || typeof c !== 'object') return;
    const patch = {};
    if (inRange(c.focusMinutes, H.focusMinMinutes, H.focusMaxMinutes)) patch.focusMinutes = c.focusMinutes;
    if (inRange(c.breakMinutes, H.breakMinMinutes, H.breakMaxMinutes)) patch.focusBreakMinutes = c.breakMinutes;
    if (typeof c.cycle === 'boolean') patch.focusCycle = c.cycle;
    if (!Object.keys(patch).length) return;
    config.update(patch);
    if (patch.focusMinutes) settings.focusMinutes = patch.focusMinutes;
    if (patch.focusBreakMinutes) settings.breakMinutes = patch.focusBreakMinutes;
    if (typeof patch.focusCycle === 'boolean') settings.focusCycle = patch.focusCycle;
  });
  ipcMain.on('focus:session', (_e, s) => {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !inRange(s.count, 0, 999)) return;
    settings.focusSessions = { date: s.date, count: s.count };
    config.update({ focusSessions: settings.focusSessions });
  });
  const PHASE_CHIME = { break: 'pomoBreak', focus: 'pomoFocus', done: 'focus' };
  ipcMain.on('focus:phase', (_e, p) => {
    if (!p || !PHASE_CHIME[p.phase] || quiet()) return; // nothing while paused or a game is in front
    if (settings.sounds) windowMgr.send('chime', PHASE_CHIME[p.phase]);
    notify.toast(p.phase === 'done' ? 'focus' : p.phase === 'break' ? 'pomoBreak' : 'pomoFocus', { minutes: p.minutes });
  });

  // ---------- tray ----------
  function togglePause() {
    settings.paused = !settings.paused;
    applyQuiet();
  }

  const actions = {
    toggle(key) {
      if (key === 'paused') return togglePause();
      settings[key] = !settings[key];
      if (key === 'gameMode') {
        game.setEnabled(settings.gameMode);
        config.update({ gameMode: settings.gameMode });
      } else if (key === 'personality') {
        config.update({ personality: settings.personality });
        pushSettings();
      } else if (key === 'sounds') {
        config.update({ sounds: settings.sounds });
        pushSettings();
      } else if (key === 'showUsage') {
        config.update({ showUsage: settings.showUsage });
        usage.setEnabled(settings.showUsage);
      } else if (key === 'music') {
        config.update({ music: settings.music });
        music.setEnabled(settings.music);
      } else if (key === 'startup') {
        // runs `electron.exe <this folder>` at login
        app.setLoginItemSettings({ openAtLogin: settings.startup, path: process.execPath, args: [path.resolve(app.getAppPath())] });
      }
    },
    setMotion(m) {
      settings.motion = m;
      config.update({ motion: m });
      pushSettings();
    },
    setMonitor(id) {
      settings.monitor = id;
      config.update({ monitor: id });
      windowMgr.reposition(id);
    },
    setAssistantMode(m) {
      if (!['both', 'claudeCode', 'chatOnly'].includes(m)) return;
      settings.assistantMode = m;
      config.update({ assistantMode: m });
      pushSettings();
    },
    setChatProvider(id) {
      if (hub.setCurrent(id)) {
        settings.chatProvider = hub.current;
        config.update({ chatProvider: hub.current });
        pushSettings();
        pushProviders();
      }
    },
    preview: (s) => state.preview(s),
    personality: (kind) => (kind === 'break' ? windowMgr.send('break', { minutes: 50, preview: true }) : windowMgr.send('personality', kind)),
  };
  tray.create({ getSettings: () => settings, actions });

  globalShortcut.register('Control+Alt+M', togglePause);

  // ---------- go ----------
  usage.start();
  breaks.start();
  music.start();
  game.start();
  // MOCHI_PORT lets a test copy run without receiving the real hook events
  server.start({
    port: Number(process.env.MOCHI_PORT) || cfg.port,
    token: cfg.token,
    state,
    activity,
    extra: () => ({ quiet: { paused: settings.paused, gameActive: game.active, foregroundExe: game.exe, gameMode: settings.gameMode } }),
  });

  // Dev aid: `npm start -- --preview-state=needs`. An explicit flag, not an environment variable,
  // so a value left behind in a terminal can never force a state on a normal start.
  const flag = process.argv.find((a) => a.startsWith('--preview-state='));
  if (flag) state.preview(flag.split('=')[1]);

  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    music.stop();
    Object.values(providers).forEach((p) => p.reset());
    activity.stop();
    notes.stop();
    breaks.stop();
    game.stop();
    usage.stop();
  });
});

// The notch lives in the tray; closing the window must not quit the app.
app.on('window-all-closed', (e) => e.preventDefault());

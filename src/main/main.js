const { app, ipcMain, globalShortcut } = require('electron');
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
    monitor: cfg.monitor,
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
    windowMgr.send('settings', { motion: settings.motion, sounds: settings.sounds, focusMinutes: settings.focusMinutes, personality: settings.personality });
  win.webContents.on('did-finish-load', () => {
    const snap = state.snapshot();
    windowMgr.send('state', snap.state);
    windowMgr.send('session', snap);
    if (usage.current) windowMgr.send('usage', usage.current);
    windowMgr.send('music', music.current);
    pushSettings();
  });

  // ---------- renderer requests ----------
  ipcMain.on('music:command', (_e, cmd) => (cmd === 'open' ? music.open() : music.command(cmd)));
  // Allow / Deny buttons in the notch. id -1 is the tray "Preview state" sample: just close it.
  ipcMain.on('approval:resolve', (_e, { id, decision }) => {
    if (decision !== 'allow' && decision !== 'deny') return;
    if (id === -1) state.preview(null);
    else state.resolve(id, decision);
  });
  ipcMain.on('focus:minutes', (_e, m) => {
    const min = Math.round(Number(m));
    if (!(min >= theme.home.focusMinMinutes && min <= theme.home.focusMaxMinutes)) return;
    settings.focusMinutes = min;
    config.update({ focusMinutes: min });
  });
  ipcMain.on('focus:done', () => {
    if (quiet()) return;
    if (settings.sounds) windowMgr.send('chime', 'focus');
    notify.toast('focus', {});
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
  server.start({ port: Number(process.env.MOCHI_PORT) || cfg.port, token: cfg.token, state });

  // Dev aid: `npm start -- --preview-state=needs`. An explicit flag, not an environment variable,
  // so a value left behind in a terminal can never force a state on a normal start.
  const flag = process.argv.find((a) => a.startsWith('--preview-state='));
  if (flag) state.preview(flag.split('=')[1]);

  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    music.stop();
    breaks.stop();
    game.stop();
    usage.stop();
  });
});

// The notch lives in the tray; closing the window must not quit the app.
app.on('window-all-closed', (e) => e.preventDefault());

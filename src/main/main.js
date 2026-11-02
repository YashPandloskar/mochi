const { app, ipcMain } = require('electron');
const theme = require('../theme');
const config = require('./config');
const windowMgr = require('./window');
const tray = require('./tray');
const server = require('./server');
const SessionState = require('./session-state');
const Usage = require('./usage');
const Music = require('./music');

app.setName('mochi');
// A second copy must do nothing at all: no window, no server, no config writes.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.exit(0);

ipcMain.on('theme:get', (e) => {
  e.returnValue = theme;
});
ipcMain.on('hit:size', (_e, size) => windowMgr.setHitSize(size));

app.whenReady().then(() => {
  if (!gotLock) return;
  const cfg = config.load();
  const state = new SessionState({
    jobs: cfg.jobs,
    onJobs: (jobs) => config.update({ jobs }),
  });

  const usage = new Usage({ dir: config.configDir(), enabled: cfg.showUsage });
  usage.on('change', (u) => windowMgr.send('usage', u));
  usage.start();

  const music = new Music({ enabled: cfg.music });
  music.on('change', (m) => windowMgr.send('music', m));
  ipcMain.on('music:command', (_e, cmd) => (cmd === 'open' ? music.open() : music.command(cmd)));
  music.start();
  app.on('before-quit', () => {
    music.stop();
    usage.stop();
  });

  const win = windowMgr.create(cfg);
  // Allow / Deny buttons in the notch. id -1 is the tray "Preview state" sample: just close it.
  ipcMain.on('approval:resolve', (_e, { id, decision }) => {
    if (decision !== 'allow' && decision !== 'deny') return;
    if (id === -1) state.preview(null);
    else state.resolve(id, decision);
  });

  const trayIcon = tray.create({
    showUsage: cfg.showUsage,
    onToggleUsage: (on) => {
      config.update({ showUsage: on });
      usage.setEnabled(on);
    },
    showMusic: cfg.music,
    onToggleMusic: (on) => {
      config.update({ music: on });
      music.setEnabled(on);
    },
    onPreview: (s) => state.preview(s),
  });

  state.on('change', (snap) => {
    windowMgr.send('state', snap.state);
    windowMgr.send('session', snap);
    trayIcon.refresh(snap);
  });
  win.webContents.on('did-finish-load', () => {
    const snap = state.snapshot();
    windowMgr.send('state', snap.state);
    windowMgr.send('session', snap);
    if (usage.current) windowMgr.send('usage', usage.current);
    windowMgr.send('music', music.current);
  });

  // MOCHI_PORT lets a test copy run without receiving the real hook events
  server.start({ port: Number(process.env.MOCHI_PORT) || cfg.port, token: cfg.token, state });

  // Dev aid: `npm start -- --preview-state=needs`. An explicit flag, not an environment variable,
  // so a value left behind in a terminal can never force a state on a normal start.
  const flag = process.argv.find((a) => a.startsWith('--preview-state='));
  if (flag) state.preview(flag.split('=')[1]);
});

// The notch lives in the tray; closing the window must not quit the app.
app.on('window-all-closed', (e) => e.preventDefault());

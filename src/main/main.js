const { app, ipcMain } = require('electron');
const theme = require('../theme');
const config = require('./config');
const windowMgr = require('./window');
const tray = require('./tray');
const server = require('./server');
const SessionState = require('./session-state');

app.setName('mochi');
if (!app.requestSingleInstanceLock()) app.quit();

ipcMain.on('theme:get', (e) => {
  e.returnValue = theme;
});
ipcMain.on('hit:size', (_e, size) => windowMgr.setHitSize(size));

app.whenReady().then(() => {
  const cfg = config.load();
  const state = new SessionState({
    jobs: cfg.jobs,
    onJobs: (jobs) => config.update({ jobs }),
  });

  const win = windowMgr.create(cfg);
  const trayIcon = tray.create({
    onPreview: (s) => state.preview(s),
    onResolve: (id, decision) => state.resolve(id, decision),
    onMood: (m) => windowMgr.send('mood', m),
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
  });

  server.start({ port: cfg.port, token: cfg.token, state });

  if (process.env.MOCHI_STATE) state.preview(process.env.MOCHI_STATE);
});

// The notch lives in the tray; closing the window must not quit the app.
app.on('window-all-closed', (e) => e.preventDefault());

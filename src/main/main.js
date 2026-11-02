const { app, ipcMain } = require('electron');
const theme = require('../theme');
const config = require('./config');
const windowMgr = require('./window');
const tray = require('./tray');

app.setName('mochi');
if (!app.requestSingleInstanceLock()) app.quit();

ipcMain.on('theme:get', (e) => {
  e.returnValue = theme;
});
ipcMain.on('hit:size', (_e, size) => windowMgr.setHitSize(size));

app.whenReady().then(() => {
  const cfg = config.load();
  const win = windowMgr.create(cfg);
  const preview = (state) => windowMgr.send('state', state);
  tray.create({ onDebugState: preview });

  const initial = process.env.MOCHI_STATE;
  if (initial) win.webContents.once('did-finish-load', () => preview(initial));
});

// The notch lives in the tray; closing the window must not quit the app.
app.on('window-all-closed', (e) => e.preventDefault());

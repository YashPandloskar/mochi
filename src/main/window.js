const { BrowserWindow, screen } = require('electron');
const path = require('path');
const theme = require('../theme');

let win = null;
let hitSize = { w: theme.collapsed.width, h: theme.collapsed.height };
let hovering = false;
let pollTimer = null;

function pickDisplay(monitor) {
  const all = screen.getAllDisplays();
  if (monitor && monitor !== 'primary') {
    const found = all.find((d) => String(d.id) === String(monitor));
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

function place(monitor) {
  const b = pickDisplay(monitor).bounds;
  const { width, height } = theme.window;
  win.setBounds({ x: Math.round(b.x + (b.width - width) / 2), y: b.y, width, height });
}

function create(cfg) {
  win = new BrowserWindow({
    width: theme.window.width,
    height: theme.window.height,
    title: 'mochi',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  place(cfg.monitor);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());

  // Click-through: the window ignores the mouse except while the pointer is over the notch.
  // Polling the cursor is more reliable than forwarded mousemove events.
  pollTimer = setInterval(poll, theme.timings.hoverPollMs);
  win.on('closed', () => {
    clearInterval(pollTimer);
    win = null;
  });
  screen.on('display-metrics-changed', () => win && place(cfg.monitor));
  return win;
}

function poll() {
  if (!win || win.isDestroyed()) return;
  const pt = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const left = (b.width - hitSize.w) / 2;
  const x = pt.x - b.x;
  const y = pt.y - b.y;
  const inside = x >= left && x <= left + hitSize.w && y >= 0 && y <= hitSize.h;
  if (inside === hovering) return;
  hovering = inside;
  win.setIgnoreMouseEvents(!inside, { forward: true });
  win.webContents.send('hover', inside);
}

// Renderer reports the size it is animating towards so the hit area follows it.
function setHitSize(size) {
  hitSize = size;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function reposition(monitor) {
  if (win) place(monitor);
}

module.exports = { create, setHitSize, send, reposition, pickDisplay };

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const theme = require('../theme');

let win = null;
let hitSize = { w: theme.collapsed.width, h: theme.collapsed.height, collapsed: true };
let hovering = false;
let pollTimer = null;
let topTimer = null;
let visible = true;
let insideSince = 0; // when the pointer entered the collapsed notch (for the hover dwell)

function pickDisplay(monitor) {
  const all = screen.getAllDisplays();
  if (monitor && monitor !== 'primary') {
    const found = all.find((d) => String(d.id) === String(monitor));
    if (found) return found;
  }
  return screen.getPrimaryDisplay();
}

let currentMonitor = 'primary';

function place(monitor) {
  currentMonitor = monitor;
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
      autoplayPolicy: 'no-user-gesture-required', // the chime plays without a click
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  place(cfg.monitor);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => visible && win.showInactive());

  // Click-through: the window ignores the mouse except while the pointer is over the notch.
  // Polling the cursor is more reliable than forwarded mousemove events.
  pollTimer = setInterval(poll, theme.timings.hoverPollMs);
  // Windows can slip another window (for example a maximized Claude) above an always-on-top window.
  // Re-assert the top position once a second; it does not take focus.
  topTimer = setInterval(() => visible && win && !win.isDestroyed() && win.moveTop(), 1000);
  win.on('blur', () => {
    if (!win.isFocusable()) return;
    win.setFocusable(false);
    win.webContents.send('window:blur');
  });
  win.on('closed', () => {
    clearInterval(pollTimer);
    clearInterval(topTimer);
    win = null;
  });
  screen.on('display-metrics-changed', () => win && place(currentMonitor));
  screen.on('display-removed', () => win && place(currentMonitor));
  return win;
}

function poll() {
  if (!win || win.isDestroyed() || !visible) return;
  const pt = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const left = (b.width - hitSize.w) / 2;
  const x = pt.x - b.x;
  const y = pt.y - b.y;
  let inside = x >= left && x <= left + hitSize.w && y >= 0 && y <= hitSize.h;

  // A flick across the top of the screen must not open the notch: when it is collapsed the pointer
  // has to rest on it for a moment first. An already-open panel responds at once.
  const collapsed = !!hitSize.collapsed;
  if (inside && !hovering && collapsed) {
    if (!insideSince) insideSince = Date.now();
    if (Date.now() - insideSince < theme.timings.hoverDwell * 1000) inside = false;
  } else if (!inside) insideSince = 0;

  if (inside === hovering) return;
  hovering = inside;
  win.setIgnoreMouseEvents(!inside, { forward: true });
  win.webContents.send('hover', inside);
}

// The notch never takes keyboard focus, except while you type in the Chat tab.
// Focus is handed back as soon as the window loses it (or you press Esc).
function setFocus(on) {
  if (!win || win.isDestroyed()) return;
  if (on) {
    win.setFocusable(true);
    win.focus();
  } else {
    win.blur();
    win.setFocusable(false);
  }
}

// Hides the notch completely (game mode / paused) or brings it back, without stealing focus.
function setVisible(on) {
  if (on === visible) return;
  visible = on;
  if (!win || win.isDestroyed()) return;
  if (on) win.showInactive();
  else {
    hovering = false;
    insideSince = 0;
    win.setIgnoreMouseEvents(true, { forward: true });
    win.hide();
  }
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

module.exports = { create, setHitSize, send, reposition, pickDisplay, setVisible, setFocus };

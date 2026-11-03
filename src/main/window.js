const { BrowserWindow, screen } = require('electron');
const path = require('path');
const theme = require('../theme');

let win = null;
let hitSize = { w: theme.collapsed.width, h: theme.collapsed.height, collapsed: true };
let hovering = false;
let pollTimer = null;
let topTimer = null;
let visible = true;
let holdH = 0; // taller hit area kept for a moment after switching to a shorter panel
let holdUntil = 0;
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

const PARKED = -32000; // where the window waits while mochi is paused or a game is in front

function place(monitor) {
  currentMonitor = monitor;
  if (!visible) return; // stays parked; setVisible(true) places it
  const b = pickDisplay(monitor).bounds;
  const { width, height } = theme.window;
  const x = Math.round(b.x + (b.width - width) / 2);
  // setPosition, not setBounds: on Windows a setBounds on this click-through window can leave it showing and
  // hovering normally while every mouse press is silently dropped (reproduced in isolation). The size never
  // changes, so only a first placement needs to set it.
  const now = win.getBounds();
  if (now.width !== width || now.height !== height) win.setSize(width, height);
  win.setPosition(x, b.y);
}

// ---------- what went wrong, if anything: ~/.mochi/mochi.log ----------
function log(msg) {
  try {
    require('fs').appendFileSync(path.join(require('./config').configDir(), 'mochi.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

let lastCfg = null;
let onCreated = null;
let lastRecreate = 0;
let droppedPresses = [];
let displayHooked = false;

// Builds the window again from scratch (a crash, a hang, or the mouse-press bug below). Everything the rest of
// mochi pushes to the page is re-sent by onCreated.
function recreate(reason) {
  if (!win || win.isDestroyed() || !lastCfg) return;
  if (Date.now() - lastRecreate < 15000) return log(`recreate skipped (${reason}): one was done a moment ago`);
  lastRecreate = Date.now();
  log(`recreating the window: ${reason}`);
  clearInterval(pollTimer);
  clearInterval(topTimer);
  const old = win;
  win = null;
  hovering = false;
  insideSince = 0;
  try {
    old.removeAllListeners('closed');
    old.destroy();
  } catch {}
  create(lastCfg);
}

// The page saw a mouse release whose press never arrived (the press went to whatever is behind the notch). Seen
// after a window was moved or resized while click-through; a new window always works, so after two in a row it is replaced.
function pressDropped() {
  const now = Date.now();
  droppedPresses = droppedPresses.filter((t) => now - t < 12000);
  droppedPresses.push(now);
  log(`a mouse press did not reach the page (${droppedPresses.length})`);
  if (droppedPresses.length >= 2) {
    droppedPresses = [];
    recreate('mouse presses are being dropped');
  }
}

// cb(win) runs for the current window now and for every window built later (after a recreate)
function whenCreated(cb) {
  onCreated = cb;
  if (win && !win.isDestroyed()) cb(win);
}

function create(cfg, created) {
  lastCfg = cfg;
  if (created) onCreated = created;
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
  win.once('ready-to-show', () => {
    win.showInactive(); // always shown once; if mochi starts paused or with a game in front it is parked
    if (!visible) win.setPosition(PARKED, PARKED);
  });

  // Click-through: the window ignores the mouse except while the pointer is over the notch.
  // Polling the cursor is more reliable than forwarded mousemove events.
  pollTimer = setInterval(poll, theme.timings.hoverPollMs);
  // Windows can slip another window (for example a maximized Claude) above an always-on-top window.
  // Re-assert the top position once a second; it does not take focus.
  topTimer = setInterval(() => {
    if (!visible || !win || win.isDestroyed() || hovering) return; // never touch the window while it is being used
    win.moveTop();
  }, 1000);
  const w = win;
  w.on('blur', () => {
    if (win !== w || !w.isFocusable()) return;
    w.setFocusable(false);
    applyMouse();
    w.webContents.send('window:blur');
  });
  w.on('closed', () => {
    if (win !== w) return;
    clearInterval(pollTimer);
    clearInterval(topTimer);
    win = null;
  });

  // a crashed, hung or failed page is rebuilt instead of leaving a dead notch on screen
  w.webContents.on('render-process-gone', (_e, d) => {
    log(`renderer process gone: ${d && d.reason}`);
    if (win === w) setTimeout(() => recreate('renderer process gone'), 500);
  });
  w.on('unresponsive', () => {
    log('window is not responding');
    setTimeout(() => win === w && !w.isDestroyed() && w.webContents.isLoading() === false && recreate('window stayed unresponsive'), 8000);
  });
  w.webContents.on('did-fail-load', (_e, code, desc) => {
    log(`page failed to load: ${code} ${desc}`);
    setTimeout(() => win === w && !w.isDestroyed() && w.loadFile(path.join(__dirname, '..', 'renderer', 'index.html')), 1000);
  });
  // errors thrown inside the page end up in the log too
  w.webContents.on('console-message', (e) => {
    if (e && e.level === 'error') log(`page error: ${e.message} (${e.sourceId || ''}:${e.lineNumber || ''})`);
  });

  if (!displayHooked) {
    displayHooked = true;
    screen.on('display-metrics-changed', () => win && place(currentMonitor));
    screen.on('display-removed', () => win && place(currentMonitor));
  }
  if (onCreated) onCreated(w);
  return w;
}

function poll() {
  if (!win || win.isDestroyed() || !visible) return;
  const pt = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const left = (b.width - hitSize.w) / 2;
  const x = pt.x - b.x;
  const y = pt.y - b.y;
  const h = Date.now() < holdUntil ? Math.max(hitSize.h, holdH) : hitSize.h;
  let inside = x >= left && x <= left + hitSize.w && y >= 0 && y <= h;

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
  applyMouse();
}

// Changing focusability on Windows resets the window's click-through state, which left the notch showing but
// letting every click fall through to the window behind it. Re-assert what the hover logic last decided.
function applyMouse() {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!hovering, { forward: true });
}

// Hides the notch completely (game mode / paused) or brings it back, without stealing focus.
function setVisible(on) {
  if (on === visible) return;
  visible = on;
  if (!win || win.isDestroyed()) return;
  // The window is never hidden: on Windows, win.hide() followed by win.show() leaves a window that is drawn and
  // hovers fine but silently loses every mouse press (tested: the press never reaches the page, release does).
  // Instead it is parked far outside every screen, where it cannot be seen, cannot be clicked and cannot get in
  // the way of a fullscreen game, and moved back when it is wanted again.
  hovering = false;
  insideSince = 0;
  win.setIgnoreMouseEvents(true, { forward: true });
  if (on) {
    place(currentMonitor);
    if (!win.isVisible()) win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  } else {
    win.setPosition(PARKED, PARKED);
  }
}

// Renderer reports the size it is animating towards so the hit area follows it.
function setHitSize(size) {
  // Switching to a shorter panel (Notes -> Home) moves its bottom edge up past the pointer, which used to count
  // as leaving the notch: it collapsed, and the next clicks fell through to the window behind. Keep the old,
  // taller area for a moment so the pointer stays "inside" while you aim at the new panel.
  if (!hitSize.collapsed && !size.collapsed && size.h < hitSize.h) {
    holdH = Date.now() < holdUntil ? Math.max(holdH, hitSize.h) : hitSize.h;
    holdUntil = Date.now() + theme.timings.hitHoldMs;
  } else if (size.collapsed) holdUntil = 0;
  hitSize = size;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function reposition(monitor) {
  if (win) place(monitor);
}

module.exports = { create, setHitSize, send, reposition, pickDisplay, setVisible, setFocus, pressDropped, recreate, whenCreated, current: () => win, log };

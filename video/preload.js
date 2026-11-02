// Launch-trailer stage: stands in for src/preload.js. The real Mochi interface (src/renderer) runs unchanged;
// this gives it a fake `window.mochi` whose events are fired by video/director.js instead of by Claude Code.
const { ipcRenderer } = require('electron');
const theme = require('../src/theme.js');

theme.sounds.volume = 0.3; // Mochi's chimes, a little louder so they sit on top of the score

const bus = {};
const on = (channel) => (cb) => {
  (bus[channel] = bus[channel] || []).push(cb);
};
window.__emit = (channel, payload) => (bus[channel] || []).forEach((cb) => cb(payload));
window.__h = {}; // actions the interface sends back (clicks on Allow, a chat message...), answered by the director
const call = (name) => (...args) => window.__h[name] && window.__h[name](...args);

window.mochi = {
  theme,
  setHitSize() {},
  onHover: on('hover'),
  onState: on('state'),
  onUsage: on('usage'),
  onMusic: on('music'),
  musicCommand: call('music'),
  onSettings: on('settings'),
  onChime: on('chime'),
  notesSave: call('notesSave'),
  notesGet: () => Promise.resolve(window.__notes || { todos: [], note: '' }),
  notesOpen() {},
  onNotes: on('notes'),
  onNotesStatus: on('notesStatus'),
  chatSend: call('chatSend'),
  captureScreen: () => (window.__h.capture ? window.__h.capture() : Promise.resolve({ error: 'no screen' })),
  chatStop() {},
  chatNew() {},
  onChat: on('chat'),
  focusWindow() {},
  onWindowBlur: on('windowBlur'),
  onBreak: on('break'),
  breakAnswer: call('breakAnswer'),
  onPersonality: on('personality'),
  focusConfig() {},
  focusSession() {},
  focusPhase: call('focusPhase'),
  resolveApproval: call('approval'),
  onSession: on('session'),
};

// recording plumbing (main writes the file)
window.__rec = {
  chunk: (u8) => ipcRenderer.send('rec:chunk', u8),
  started: () => ipcRenderer.send('rec:started'),
  finish: () => ipcRenderer.send('rec:finish'),
  log: (m) => ipcRenderer.send('rec:log', String(m)),
  grab: () => ipcRenderer.invoke('rec:grab'), // the current frame as raw BGRA pixels (--render)
  options: ipcRenderer.sendSync('rec:options'),
};

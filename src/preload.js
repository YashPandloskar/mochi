const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mochi', {
  theme: ipcRenderer.sendSync('theme:get'),
  setHitSize: (size) => ipcRenderer.send('hit:size', size),
  onHover: (cb) => ipcRenderer.on('hover', (_e, inside) => cb(inside)),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onUsage: (cb) => ipcRenderer.on('usage', (_e, u) => cb(u)),
  onMusic: (cb) => ipcRenderer.on('music', (_e, m) => cb(m)),
  musicCommand: (cmd) => ipcRenderer.send('music:command', cmd), // playpause | next | prev | open
  onSettings: (cb) => ipcRenderer.on('settings', (_e, s) => cb(s)),
  onChime: (cb) => ipcRenderer.on('chime', (_e, kind) => cb(kind)),
  notesSave: (data) => ipcRenderer.send('notes:save', data), // { todos: [{ text, done }], note }
  notesGet: () => ipcRenderer.invoke('notes:get'), // asks for the current notes (start-up does not depend on a push)
  notesOpen: () => ipcRenderer.send('notes:open'), // opens notes.md in your editor
  onNotes: (cb) => ipcRenderer.on('notes', (_e, d) => cb(d)),
  onNotesStatus: (cb) => ipcRenderer.on('notes:status', (_e, s) => cb(s)), // { ok } or { ok: false, message }
  chatSend: (text, image) => ipcRenderer.send('chat:send', image ? { text, image } : text),
  captureScreen: () => ipcRenderer.invoke('chat:capture'), // only when you press the camera button
  chatStop: () => ipcRenderer.send('chat:stop'),
  chatNew: () => ipcRenderer.send('chat:new'),
  onChat: (cb) => ipcRenderer.on('chat', (_e, ev) => cb(ev)),
  focusWindow: (on) => ipcRenderer.send('window:focus', on), // the notch takes keyboard focus only while you type
  onWindowBlur: (cb) => ipcRenderer.on('window:blur', () => cb()),
  onBreak: (cb) => ipcRenderer.on('break', (_e, info) => cb(info)),
  breakAnswer: (action) => ipcRenderer.send('break:answer', action), // ok | snooze
  onPersonality: (cb) => ipcRenderer.on('personality', (_e, kind) => cb(kind)), // tray previews
  focusConfig: (c) => ipcRenderer.send('focus:config', c), // { focusMinutes, breakMinutes, cycle }
  focusSession: (s) => ipcRenderer.send('focus:session', s), // { date, count }
  focusPhase: (p) => ipcRenderer.send('focus:phase', p), // { phase: 'break' | 'focus' | 'done', minutes }
  resolveApproval: (id, decision) => ipcRenderer.send('approval:resolve', { id, decision }),
  onSession: (cb) => ipcRenderer.on('session', (_e, snap) => cb(snap)),
});

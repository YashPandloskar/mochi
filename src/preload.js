const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mochi', {
  theme: ipcRenderer.sendSync('theme:get'),
  setHitSize: (size) => ipcRenderer.send('hit:size', size),
  onHover: (cb) => ipcRenderer.on('hover', (_e, inside) => cb(inside)),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onUsage: (cb) => ipcRenderer.on('usage', (_e, u) => cb(u)),
  onMood: (cb) => ipcRenderer.on('mood', (_e, mood) => cb(mood)),
  onSession: (cb) => ipcRenderer.on('session', (_e, snap) => cb(snap)),
});

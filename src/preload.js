const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mochi', {
  theme: ipcRenderer.sendSync('theme:get'),
  setHitSize: (size) => ipcRenderer.send('hit:size', size),
  onHover: (cb) => ipcRenderer.on('hover', (_e, inside) => cb(inside)),
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  onSession: (cb) => ipcRenderer.on('session', (_e, snap) => cb(snap)),
});

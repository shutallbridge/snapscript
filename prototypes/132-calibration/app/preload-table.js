// PROTOTYPE (#115, #132): the table view's bridge to main.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('table', {
  onState: f => ipcRenderer.on('state', (_, light, hud) => f(light, hud)),
  onTrip: f => ipcRenderer.on('trip', (_, r) => f(r)),
  lit: (seq, t) => ipcRenderer.send('lit', seq, t),
  // #132
  onFrame: f => ipcRenderer.on('frame', (_, m) => f(m)),
  onCalib: f => ipcRenderer.on('calib', (_, m) => f(m)),
  onGeo: f => ipcRenderer.on('geo', (_, g) => f(g)),
  onKey: f => ipcRenderer.on('key', (_, k) => f(k)),
  cmd: c => ipcRenderer.send('cmd', c),
  sketch: show => ipcRenderer.send('sketch', show),
});

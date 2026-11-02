// PROTOTYPE (#115): the table view's bridge to main.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('table', {
  onState: f => ipcRenderer.on('state', (_, light, hud) => f(light, hud)),
  onTrip: f => ipcRenderer.on('trip', (_, r) => f(r)),
  lit: (seq, t) => ipcRenderer.send('lit', seq, t),
});

// The only bridge between our panel and the app: a few named calls, no Node access.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('slipper', {
  onLocation: fn => ipcRenderer.on('slides:location', (_e, v) => fn(v)),
  onLog: fn => ipcRenderer.on('slides:log', (_e, v) => fn(v)),
  probe: () => ipcRenderer.invoke('panel:probe'),
  browsers: () => ipcRenderer.invoke('panel:browsers'),
  importCookies: id => ipcRenderer.invoke('panel:import-cookies', id),
  go: url => ipcRenderer.invoke('panel:go', url)
});

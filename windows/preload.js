'use strict';
// What the app page may ask of Windows: only the notes backup folder (and "try again" on the first-start page).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rdDesktop', {
  info: () => ipcRenderer.invoke('rd:info'),
  chooseFolder: () => ipcRenderer.invoke('rd:choose'),
  writeBackup: (json) => ipcRenderer.invoke('rd:write', json),
  retry: () => ipcRenderer.invoke('rd:retry'),
});

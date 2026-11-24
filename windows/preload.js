'use strict';
// What the app page may ask of Windows: the notes backup folder, saving a PDF (and opening it), and "try again" on the
// first-start page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rdDesktop', {
  info: () => ipcRenderer.invoke('rd:info'),
  chooseFolder: () => ipcRenderer.invoke('rd:choose'),
  writeBackup: (json) => ipcRenderer.invoke('rd:write', json),
  retry: () => ipcRenderer.invoke('rd:retry'),
  savePdf: (html, name) => ipcRenderer.invoke('rd:pdf', String(html), String(name || '')),
  openFile: (p) => ipcRenderer.invoke('rd:open', String(p)),
});

'use strict';
/* Rightly Dividing for Windows.
   A small window around the same app the iPhone uses (https://cmundell.github.io/rightly-dividing-fmnrj8/), so every
   release reaches Windows by itself and the app works offline after its first start. What it adds: your notes are
   also copied, automatically, to a real file in a folder you choose (Documents\Rightly Dividing to begin with). */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// RD_SITE: only for testing a copy of the site on this computer
const SITE = process.env.RD_SITE || 'https://cmundell.github.io/rightly-dividing-fmnrj8/';
const ORIGIN = new URL(SITE).origin;
const KEEP_DAILY = 14; // dated copies kept in the backup folder

if (!app.requestSingleInstanceLock()) app.quit();

// ---------------------------------------------------------------- small settings file (window size, backup folder)
const cfgPath = () => path.join(app.getPath('userData'), 'windows-app.json');
function readCfg() {
  try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { return {}; }
}
function writeCfg(c) {
  try { fs.writeFileSync(cfgPath(), JSON.stringify(c, null, 1)); } catch { /* not critical */ }
}
let cfg = {};

// ---------------------------------------------------------------- backups
function backupDir() {
  if (cfg.dir === undefined) {
    cfg.dir = path.join(app.getPath('documents'), 'Rightly Dividing');
    writeCfg(cfg);
  }
  return cfg.dir;
}
function writeBackup(json) {
  const dir = backupDir();
  if (!dir) return { ok: false };
  fs.mkdirSync(dir, { recursive: true });
  // the latest copy, replaced each time; written to a temporary file first so a crash never leaves half a file
  const main = path.join(dir, 'Rightly Dividing notes.json');
  fs.writeFileSync(`${main}.tmp`, json);
  fs.renameSync(`${main}.tmp`, main);
  // and one dated copy a day, the last two weeks of them
  const day = new Date().toISOString().slice(0, 10);
  const daily = path.join(dir, `Rightly Dividing notes ${day}.json`);
  fs.writeFileSync(daily, json);
  const old = fs.readdirSync(dir).filter((f) => /^Rightly Dividing notes \d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_DAILY))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* leave it */ }
  }
  cfg.last = new Date().toISOString();
  writeCfg(cfg);
  return { ok: true, dir, last: cfg.last };
}
ipcMain.handle('rd:info', () => ({ dir: backupDir(), last: cfg.last || null }));
ipcMain.handle('rd:write', (_e, json) => {
  try { return writeBackup(String(json)); } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('rd:choose', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a folder for your notes backups (for example inside OneDrive)',
    defaultPath: backupDir() || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return { dir: backupDir() };
  cfg.dir = r.filePaths[0];
  writeCfg(cfg);
  return { dir: cfg.dir };
});

// ---------------------------------------------------------------- the window
function createWindow() {
  const b = cfg.bounds || { width: 1400, height: 900 };
  const win = new BrowserWindow({
    ...b,
    minWidth: 380,
    minHeight: 500,
    title: 'Rightly Dividing',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#4a3a2c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // remember the size and place
  const save = () => {
    if (win.isDestroyed()) return;
    cfg.maximized = win.isMaximized();
    if (!cfg.maximized && !win.isMinimized()) cfg.bounds = win.getBounds();
    writeCfg(cfg);
  };
  win.on('resize', save);
  win.on('move', save);
  win.on('close', save);

  // links to other websites (Blue Letter Bible, The Gospel Film) open in your normal browser
  const outside = (url) => {
    try { return new URL(url).origin !== ORIGIN; } catch { return true; }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (outside(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (outside(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // the very first start needs the internet once; after that the app keeps itself on this computer
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3: a load replaced by another
    win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.loadURL(SITE);
  return win;
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) {
    if (w.isMinimized()) w.restore();
    w.focus();
  }
});
app.whenReady().then(() => {
  cfg = readCfg();
  Menu.setApplicationMenu(null);
  // retry from the "connect once" page
  ipcMain.handle('rd:retry', (e) => BrowserWindow.fromWebContents(e.sender).loadURL(SITE));
  createWindow();
});
app.on('window-all-closed', () => app.quit());

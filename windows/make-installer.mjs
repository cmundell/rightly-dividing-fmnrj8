// Builds dist/Rightly-Dividing-<version>-Setup.exe from dist/win-unpacked with NSIS's own compiler (makensis).
// makensis comes with electron-builder's download (~/.cache/electron-builder/nsis-*), or from your system if installed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json')));

function findNsis() {
  const cache = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache')
    : path.join(os.homedir(), '.cache', 'electron-builder');
  const top = path.join(cache, 'nsis-3.0.4.1');
  if (fs.existsSync(top)) {
    for (const d of fs.readdirSync(top)) {
      const dir = path.join(top, d);
      const bin = process.platform === 'win32' ? path.join(dir, 'Bin', 'makensis.exe')
        : path.join(dir, process.platform === 'darwin' ? 'mac' : 'linux', 'makensis');
      if (fs.existsSync(bin)) return { bin, dir };
    }
  }
  return { bin: 'makensis', dir: null }; // installed on the system
}

const { bin, dir } = findNsis();
if (process.platform !== 'win32') { try { fs.chmodSync(bin, 0o755); } catch { /* system copy */ } }
const env = { ...process.env };
if (dir) env.NSISDIR = dir;
execFileSync(bin, [
  '-V2',
  `-DVERSION=${pkg.version}`,
  `-DSRC=${path.join('dist', 'win-unpacked')}`,
  'installer.nsi',
], { cwd: here, env, stdio: 'inherit' });
console.log(`built dist/Rightly-Dividing-${pkg.version}-Setup.exe`);

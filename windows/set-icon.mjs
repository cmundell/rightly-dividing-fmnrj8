// Puts the app's icon and name into "Rightly Dividing.exe" (done here in JavaScript, so building needs no Windows).
import fs from 'node:fs';
import * as PE from 'pe-library';
import * as ResEdit from 'resedit';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)));
const exePath = new URL('./dist/win-unpacked/Rightly Dividing.exe', import.meta.url);
const exe = PE.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = PE.NtExecutableResource.from(exe);

// icon: replace the app's main icon group with ours
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(new URL('./build/icon.ico', import.meta.url)));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const target = groups.length ? groups[0] : { id: 1, lang: 1033 };
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, target.id, target.lang, ico.icons.map((i) => i.data));

// name and version shown in Windows (file properties, Task Manager)
const vis = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = vis[0];
const [a, b, c] = pkg.version.split('.').map(Number);
vi.setFileVersion(a, b, c, 0, 1033);
vi.setProductVersion(a, b, c, 0, 1033);
const lang = { lang: 1033, codepage: 1200 };
vi.setStringValues(lang, {
  FileDescription: 'Rightly Dividing',
  ProductName: 'Rightly Dividing',
  CompanyName: 'Rightly Dividing',
  OriginalFilename: 'Rightly Dividing.exe',
  InternalName: 'Rightly Dividing',
  LegalCopyright: 'Rightly Dividing',
  FileVersion: pkg.version,
  ProductVersion: pkg.version,
});
vi.outputToResourceEntries(res.entries);

res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('icon and name set on Rightly Dividing.exe');

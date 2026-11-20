# Rightly Dividing for Windows

A small Windows window (Electron) around the same app the iPhone uses, https://cmundell.github.io/rightly-dividing-fmnrj8/.
Every release of the web app reaches Windows by itself, and the app works offline after its first start.
What Windows adds: your notes are copied automatically to a real file, `Rightly Dividing notes.json`, in a folder you
choose (Documents\Rightly Dividing to begin with; Menu › Settings to change it, for example to a OneDrive folder),
with one dated copy a day for the last two weeks.

A new installer is only needed when these files change (main.js, preload.js, offline.html, the icon).

## Build the installer

    npm install
    npm run dist

This makes `dist/Rightly-Dividing-<version>-Setup.exe`: electron-builder lays out the app, `set-icon.mjs` puts the
icon and name into the .exe, and `make-installer.mjs` compiles `installer.nsi` with NSIS. It builds on Windows, Linux
or a Mac; no Wine needed. The installer is not code-signed, so Windows shows "Windows protected your PC" the first
time (More info › Run anyway).

## Try it without installing

    npm start

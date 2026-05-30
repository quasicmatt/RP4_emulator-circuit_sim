'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, typed API to the renderer process.
// The renderer never touches Node.js directly.
contextBridge.exposeInMainWorld('electronAPI', {

  // ── Script execution ──────────────────────────────────────────────────────
  runScript:    (scriptPath) => ipcRenderer.invoke('script:run', scriptPath),
  stopScript:   ()           => ipcRenderer.invoke('script:stop'),
  openDialog:   ()           => ipcRenderer.invoke('script:open-dialog'),

  // ── GPIO injection (circuit → Python) ────────────────────────────────────
  injectGPIO: (msg) => ipcRenderer.invoke('gpio:inject', msg),

  // ── Event listeners (main → renderer) ────────────────────────────────────
  onGPIOUpdate:       (cb) => ipcRenderer.on('gpio:update',        (_e, d) => cb(d)),
  onStdout:           (cb) => ipcRenderer.on('console:stdout',     (_e, d) => cb(d)),
  onStderr:           (cb) => ipcRenderer.on('console:stderr',     (_e, d) => cb(d)),
  onRuntimeConnected: (cb) => ipcRenderer.on('runtime:connected',  ()      => cb()),
  onRuntimeExit:      (cb) => ipcRenderer.on('runtime:exit',       (_e, d) => cb(d)),
  onMenuOpenScript:   (cb) => ipcRenderer.on('menu:open-script',   (_e, d) => cb(d)),
  onMenuRun:          (cb) => ipcRenderer.on('menu:run',           ()      => cb()),
  onMenuStop:         (cb) => ipcRenderer.on('menu:stop',          ()      => cb()),

  // ── Cleanup ───────────────────────────────────────────────────────────────
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

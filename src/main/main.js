'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path  = require('path');
const fs    = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

// ─── Constants ────────────────────────────────────────────────────────────────
const WS_PORT     = 8765;
const IS_DEV      = process.argv.includes('--dev');
const SHIMS_DIR   = path.join(__dirname, '..', 'python-runtime', 'shims');
const BRIDGE_PY   = path.join(__dirname, '..', 'python-runtime', 'bridge.py');

// ─── State ────────────────────────────────────────────────────────────────────
let mainWindow    = null;
let wsServer      = null;
let wsClient      = null;   // the Python subprocess's WebSocket connection
let pythonProc    = null;
let currentScript = null;

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload:        path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    ...(fs.existsSync(path.join(__dirname, '../../assets/icon.png')) && {
      icon: path.join(__dirname, '../../assets/icon.png'),
    }),
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (IS_DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => {
    stopPython();
    mainWindow = null;
  });

  buildMenu();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startWebSocketServer();
  createWindow();
});

app.on('window-all-closed', () => {
  stopPython();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── WebSocket server (bridge between Electron ↔ Python) ─────────────────────
function startWebSocketServer() {
  wsServer = new WebSocket.Server({ port: WS_PORT });

  wsServer.on('connection', (ws) => {
    wsClient = ws;
    console.log('[bridge] Python runtime connected');
    sendToRenderer('runtime:connected');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handlePythonMessage(msg);
      } catch (e) {
        console.error('[bridge] bad JSON from Python:', raw.toString());
      }
    });

    ws.on('close', () => {
      wsClient = null;
      sendToRenderer('runtime:disconnected');
    });
  });

  wsServer.on('error', (err) => {
    console.error('[ws-server]', err);
  });
}

// Messages from Python shims → renderer (circuit canvas)
function handlePythonMessage(msg) {
  // msg shape: { type: 'gpio', action: 'write'|'read_result'|'pwm', pin, value }
  sendToRenderer('gpio:update', msg);
}

// ─── Python process management ────────────────────────────────────────────────
function startPython(scriptPath) {
  stopPython();
  currentScript = scriptPath;

  // Inject shims directory into PYTHONPATH so imports resolve
  const env = {
    ...process.env,
    PYTHONPATH: SHIMS_DIR + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : ''),
    RPI_SIM_WS_PORT: String(WS_PORT),
    PYTHONUNBUFFERED: '1',
  };

  // Try 'python3' then 'python'
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';

  pythonProc = spawn(pythonBin, [BRIDGE_PY, scriptPath], { env });

  pythonProc.stdout.on('data', (d) => sendToRenderer('console:stdout', d.toString()));
  pythonProc.stderr.on('data', (d) => sendToRenderer('console:stderr', d.toString()));

  pythonProc.on('exit', (code) => {
    sendToRenderer('runtime:exit', { code });
    pythonProc = null;
  });

  pythonProc.on('error', (err) => {
    sendToRenderer('console:stderr', `[launcher] ${err.message}\n`);
  });
}

function stopPython() {
  if (pythonProc) {
    pythonProc.kill('SIGTERM');
    pythonProc = null;
  }
}

// Send message to Python runtime via WebSocket
function sendToPython(msg) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
  }
}

// ─── IPC handlers (renderer → main) ──────────────────────────────────────────
ipcMain.handle('script:run', async (_e, scriptPath) => {
  startPython(scriptPath);
  return { ok: true };
});

ipcMain.handle('script:stop', async () => {
  stopPython();
  sendToRenderer('runtime:exit', { code: null });
  return { ok: true };
});

ipcMain.handle('script:open-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Python Script',
    filters: [{ name: 'Python', extensions: ['py'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const content  = fs.readFileSync(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('gpio:inject', async (_e, msg) => {
  // Renderer telling Python that a GPIO input changed (e.g. switch pressed)
  sendToPython(msg);
  return { ok: true };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Script…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'Python', extensions: ['py'] }],
              properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length) {
              const fp = result.filePaths[0];
              mainWindow.webContents.send('menu:open-script', {
                filePath: fp,
                content: fs.readFileSync(fp, 'utf8'),
              });
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Simulation',
      submenu: [
        {
          label: 'Run Script',
          accelerator: 'F5',
          click: () => mainWindow.webContents.send('menu:run'),
        },
        {
          label: 'Stop',
          accelerator: 'Shift+F5',
          click: () => mainWindow.webContents.send('menu:stop'),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

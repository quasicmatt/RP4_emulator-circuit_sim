
/**
 * app.js — Main renderer entry point.
 * Wires up all modules and handles Electron IPC events.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Init modules ──────────────────────────────────────────────────────────
  ConsoleUI.init();
  CircuitCanvas.init();

  // ── State ─────────────────────────────────────────────────────────────────
  let currentScript = null;
  let isRunning     = false;

  // ── Toolbar buttons ────────────────────────────────────────────────────────
  const btnOpen = document.getElementById('btn-open');
  const btnRun  = document.getElementById('btn-run');
  const btnStop = document.getElementById('btn-stop');

  btnOpen.addEventListener('click', openScript);
  btnRun.addEventListener('click',  runScript);
  btnStop.addEventListener('click', stopScript);

  // ── Properties popover close ───────────────────────────────────────────────
  document.getElementById('prop-close').addEventListener('click', () => {
    document.getElementById('prop-popover').classList.add('hidden');
  });

  // ── File drag-and-drop ────────────────────────────────────────────────────
  const dropOverlay = document.getElementById('drop-overlay');

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dropOverlay.classList.remove('hidden');
    }
  });

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
      dropOverlay.classList.add('hidden');
    }
  });

  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.py')) {
      const text = await file.text();
      loadScript(file.path || file.name, text);
    }
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); openScript(); }
    if (e.key === 'F5' && !e.shiftKey) runScript();
    if (e.key === 'F5' &&  e.shiftKey) stopScript();
  });

  // ── Electron IPC listeners ────────────────────────────────────────────────
  if (window.electronAPI) {

    window.electronAPI.onGPIOUpdate((msg) => {
      window.PinMap.handleGPIOMessage(msg);
    });

    window.electronAPI.onStdout((text) => {
      ConsoleUI.append(text, 'out');
    });

    window.electronAPI.onStderr((text) => {
      ConsoleUI.append(text, 'err');
    });

    window.electronAPI.onRuntimeConnected(() => {
      ConsoleUI.sys('Python runtime connected');
      setStatus('running');
    });

    window.electronAPI.onRuntimeExit(({ code }) => {
      const msg = code === null ? 'stopped' : `exited (code ${code})`;
      ConsoleUI.sys(`Process ${msg}`);
      setRunning(false);
      setStatus(code === 0 || code === null ? 'idle' : 'error');
    });

    window.electronAPI.onMenuOpenScript((data) => {
      loadScript(data.filePath, data.content);
    });

    window.electronAPI.onMenuRun(() => runScript());
    window.electronAPI.onMenuStop(() => stopScript());
  }

  // ── Functions ─────────────────────────────────────────────────────────────
  async function openScript() {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openDialog();
    if (result) loadScript(result.filePath, result.content);
  }

  function loadScript(filePath, content) {
    currentScript = filePath;

    // Show in code panel
    const nameEl    = document.getElementById('script-name');
    const titleEl   = document.getElementById('code-panel-title');
    const codeEl    = document.getElementById('code-content');
    const fileName  = filePath.split(/[\\/]/).pop();

    nameEl.textContent  = fileName;
    titleEl.textContent = fileName;
    codeEl.textContent  = content;

    // Simple keyword coloring via innerHTML (safe, no user execution)
    highlightPython(codeEl, content);

    btnRun.disabled = false;
    ConsoleUI.sys(`Loaded: ${fileName}`);
    document.getElementById('canvas-hint').classList.add('hidden');
  }

  function highlightPython(el, code) {
    // Very lightweight syntax highlight (no external deps)
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const highlighted = escaped
      // Strings
      .replace(/(&#x27;&#x27;&#x27;[\s\S]*?&#x27;&#x27;&#x27;|&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;|&#x27;[^&#x27;]*&#x27;|&quot;[^&quot;]*&quot;)/g,
        '<span style="color:#86efac">$1</span>')
      // Keywords
      .replace(/\b(import|from|as|def|class|return|if|elif|else|for|while|in|not|and|or|is|True|False|None|try|except|finally|with|pass|break|continue|lambda|yield|global|nonlocal|raise|del|assert)\b/g,
        '<span style="color:#818cf8">$1</span>')
      // Numbers
      .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#fbbf24">$1</span>')
      // Comments
      .replace(/(#.*$)/gm, '<span style="color:#4a5568;font-style:italic">$1</span>');

    el.innerHTML = highlighted;
  }

  async function runScript() {
    if (!currentScript || isRunning) return;
    if (!window.electronAPI) {
      ConsoleUI.sys('(demo mode — Electron not available)');
      return;
    }

    ConsoleUI.clear();
    ConsoleUI.sys(`Running: ${currentScript.split(/[\\/]/).pop()}`);

    setRunning(true);
    setStatus('running');

    // Reset GPIO pin display
    Object.keys(window.PinMap.pinState).forEach(bcm => {
      window.PinMap.pinState[bcm] = { value: 0, mode: 'IN', pwm: null };
      window.PinMap.handleGPIOMessage({ pin: parseInt(bcm), action: 'cleanup' });
    });

    await window.electronAPI.runScript(currentScript);
  }

  async function stopScript() {
    if (!isRunning) return;
    await window.electronAPI.stopScript();
  }

  function setRunning(v) {
    isRunning        = v;
    btnRun.disabled  = v;
    btnStop.disabled = !v;
  }

  function setStatus(status) {
    const badge = document.getElementById('runtime-status');
    const label = badge.querySelector('.status-label');
    badge.className  = `status-badge status-${status}`;
    label.textContent = status;
  }

});

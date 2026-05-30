
const ConsoleUI = (() => {
  let el;
  let lineCount = 0;
  const MAX_LINES = 2000;

  function init() {
    el = document.getElementById('console-output');
    document.getElementById('btn-clear-console').addEventListener('click', clear);
    document.getElementById('btn-toggle-console').addEventListener('click', toggle);
  }

  function append(text, type = 'out') {
    if (!el) return;
    // Split on newlines, emit each as its own span
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i === lines.length - 1 && line === '') return; // skip trailing empty
      const span = document.createElement('span');
      span.className = `con-line con-${type}`;
      span.textContent = line;
      el.appendChild(span);
      lineCount++;
    });

    // Trim old lines
    while (lineCount > MAX_LINES) {
      el.removeChild(el.firstChild);
      lineCount--;
    }

    el.scrollTop = el.scrollHeight;
  }

  function sys(msg) {
    append(`› ${msg}`, 'sys');
  }

  function ok(msg) {
    append(`✓ ${msg}`, 'ok');
  }

  function err(msg) {
    append(msg, 'err');
  }

  function clear() {
    if (el) { el.innerHTML = ''; lineCount = 0; }
  }

  function toggle() {
    const pane = document.getElementById('console-pane');
    const btn  = document.getElementById('btn-toggle-console');
    pane.classList.toggle('hidden');
    btn.classList.toggle('tb-active');
  }

  return { init, append, sys, ok, err, clear };
})();

window.ConsoleUI = ConsoleUI;

/**
 * canvas.js — Interactive circuit canvas
 * Depends on: components.js (window.Components), mna.js (window.MNA)
 * All GRID references use the global GRID var declared in components.js
 */

// ── State ─────────────────────────────────────────────────────────────────────
var _canvas, _ctx;
var _components  = [];
var _wires       = [];
var _tool        = 'select';
var _selectedIds = [];
var _selectedWire = null;
var _activeKeypad  = null;  // id of keypad currently being held
var _dragging    = null;
var _wiringFrom  = null;
var _mousePos    = { x: 0, y: 0 };
var _hoverComp   = null;
var _hoverPin    = null;

// ── Pan / zoom state ──────────────────────────────────────────────────────────
var _panX    = 0;      // canvas pan offset X (pixels)
var _panY    = 0;      // canvas pan offset Y (pixels)
var _zoom    = 1.0;    // zoom scale factor
var _panning = false;  // middle mouse button panning
var _panStart = null;  // {x,y} mouse position when pan started
var _panOrigin = null; // {x,y} panX/panY when pan started
var MIN_ZOOM = 0.2;
var MAX_ZOOM = 4.0;

// ── Init ──────────────────────────────────────────────────────────────────────
function canvasInit() {
  _canvas = document.getElementById('circuit-canvas');
  _ctx    = _canvas.getContext('2d');

  _resizeCanvas();
  window.addEventListener('resize', _resizeCanvas);

  _canvas.addEventListener('mousedown',   _onMouseDown);
  _canvas.addEventListener('mousemove',   _onMouseMove);
  _canvas.addEventListener('mouseup',     _onMouseUp);
  _canvas.addEventListener('dblclick',    _onDblClick);
  _canvas.addEventListener('contextmenu', _onRightClick);
  _canvas.addEventListener('wheel',        _onWheel, { passive: false });
  // Reset view button
  var btnReset = document.getElementById('btn-reset-view');
  if (btnReset) btnReset.addEventListener('click', _resetView);
  window.addEventListener('keydown',      _onKeyDown);

  document.querySelectorAll('.tool-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { _setTool(btn.dataset.tool); });
  });
  document.querySelectorAll('.comp-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { _addCompCenter(btn.dataset.component); });
  });
  document.getElementById('btn-clear-canvas').addEventListener('click', _clearCanvas);
  document.getElementById('prop-close').addEventListener('click', _hideProps);

  _initPanelResize();
  requestAnimationFrame(_loop);
}

function _resizeCanvas() {
  var panel   = document.getElementById('canvas-panel');
  var palette = document.getElementById('component-palette');
  var header  = panel.querySelector('.panel-header');
  _canvas.width  = panel.clientWidth;
  _canvas.height = panel.clientHeight - (header ? header.offsetHeight : 32) - (palette ? palette.offsetHeight : 32);
}

// ── Render loop ───────────────────────────────────────────────────────────────
function _loop() {
  _runMNA();
  _draw();
  requestAnimationFrame(_loop);
}

function _draw() {
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  _ctx.save();
  _ctx.translate(_panX, _panY);
  _ctx.scale(_zoom, _zoom);
  _drawGrid();
  _wires.forEach(function(w) { _drawWire(w); });
  if (_wiringFrom) _drawWirePreview();
  _components.forEach(function(c) {
    _ctx.save();
    try { c.def.draw(_ctx, c); } catch(e) { console.error('Draw error:', c.type, e); }
    if (_selectedIds.indexOf(c.id) >= 0) _drawSelBox(c);
    if (_hoverComp && _hoverComp.id === c.id) _drawPinHints(c);
    _ctx.restore();
  });
  _ctx.restore(); // end pan/zoom transform

  // Zoom level indicator
  if (_zoom !== 1.0) {
    _ctx.font = '11px "JetBrains Mono",monospace';
    _ctx.fillStyle = '#4a5568';
    _ctx.textAlign = 'right';
    _ctx.fillText(Math.round(_zoom * 100) + '%', _canvas.width - 8, _canvas.height - 8);
  }

  var hint = document.getElementById('canvas-hint');
  if (hint) hint.classList.toggle('hidden', _components.length > 0);
}

function _drawGrid() {
  _ctx.strokeStyle = '#1a2030'; _ctx.lineWidth = 0.5;
  for (var x = 0; x <= _canvas.width;  x += GRID) { _ctx.beginPath(); _ctx.moveTo(x,0); _ctx.lineTo(x,_canvas.height); _ctx.stroke(); }
  for (var y = 0; y <= _canvas.height; y += GRID) { _ctx.beginPath(); _ctx.moveTo(0,y); _ctx.lineTo(_canvas.width,y);  _ctx.stroke(); }
}

function _drawWire(w) {
  var a = _getPinXY(w.from.compId, w.from.pinIdx);
  var b = _getPinXY(w.to.compId,   w.to.pinIdx);
  if (!a || !b) return;
  var ca = _getComp(w.from.compId);
  var cb = _getComp(w.to.compId);
  var va2 = ca && ca.pins[w.from.pinIdx] ? ca.pins[w.from.pinIdx]._voltage || 0 : 0;
  var vb2 = cb && cb.pins[w.to.pinIdx]   ? cb.pins[w.to.pinIdx]._voltage   || 0 : 0;
  var v = Math.max(va2, vb2);
  // Color: grey=0V, dim green=low, bright green=high
  var color;
  if      (v > 4.0) color = '#3cff00ef'; // amber = near 5V
  else if (v > 2.8) color = '#4ade80'; // bright green = 3.3V range
  else if (v > 1.0) color = '#86efac'; // dim green = mid voltage
  else if (v > 0.1) color = '#22d3ee'; // cyan = low voltage
  else if (v < -4.0) color = '#f10c0c'; // bright green = 3.3V range
  else if (v < -2.8) color = '#ff9b05'; // bright green = 3.3V range
  else if (v < -1.0) color = '#e69f07'; // dim green = mid voltage
  else if (v < -0.1) color = '#ffee04'; // cyan = low voltage
  else              color = '#30363d'; // grey = 0V / unconnected
  _ctx.beginPath();
  _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, a.y); _ctx.lineTo(b.x, b.y);
  _ctx.strokeStyle = w === _selectedWire ? '#fbbf24' : color;
  _ctx.lineWidth = 2; _ctx.stroke();
  if (v > 0.01 || v < -.01) {
    _ctx.font = '9px monospace'; _ctx.fillStyle = color; _ctx.textAlign = 'center';
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    _ctx.fillText(v.toFixed(2)+'V', mx, my - 6);
  }
}

function _drawWirePreview() {
  _ctx.beginPath();
  _ctx.moveTo(_wiringFrom.x, _wiringFrom.y);
  _ctx.lineTo(_mousePos.x, _wiringFrom.y);
  _ctx.lineTo(_mousePos.x, _mousePos.y);
  _ctx.strokeStyle = '#4ade8088'; _ctx.lineWidth = 1.5;
  _ctx.setLineDash([4,4]); _ctx.stroke(); _ctx.setLineDash([]);
}

function _drawSelBox(c) {
  var pad = 6;
  _ctx.strokeStyle = '#fbbf2488'; _ctx.lineWidth = 1;
  _ctx.setLineDash([4,3]);
  _ctx.beginPath(); _ctx.roundRect(c.x-pad, c.y-pad, c.def.width*GRID+pad*2, c.def.height*GRID+pad*2, 4);
  _ctx.stroke(); _ctx.setLineDash([]);
}

function _drawPinHints(c) {
  c.def.pins.forEach(function(pin, i) {
    var px = c.x + pin.gx*GRID, py = c.y + pin.gy*GRID;
    var isHover = _hoverPin && _hoverPin.compId === c.id && _hoverPin.pinIdx === i;
    _ctx.beginPath(); _ctx.arc(px, py, isHover?7:4, 0, Math.PI*2);
    _ctx.strokeStyle = isHover ? '#4ade80' : '#4ade8044'; _ctx.lineWidth = 1.5; _ctx.stroke();
  });
}

// ── MNA ───────────────────────────────────────────────────────────────────────
function _runMNA() {
  if (_components.length === 0 || !window.MNA) return;

  // Step 0: Flush ALL pending GPIO messages before solving.
  // This ensures rapid back-to-back GPIO writes are never skipped.
  if (window.PinMap && window.PinMap.flushPending) {
    window.PinMap.flushPending();
  }

  // Step 1: Update digital IC logic FIRST using previous frame voltages.
  // This sets _driven and _voltage on output pins before MNA runs,
  // so MNA can treat driven outputs as voltage sources.
  _components.forEach(function(c) {
    if (c.def && typeof c.def.update === 'function') {
      try { c.def.update(c); } catch(e) { console.error('IC update error:', c.type, e); }
    }
  });

  // Step 2: MNA solve - picks up driven IC pins as voltage sources
  try {
    window.MNA.solve(_components, _wires);
  } catch(e) { console.error('MNA error:', e); return; }

  // Update LED lit state
  _components.forEach(function(c) {
    if (c.type !== 'led') return;
    if (c.connectedBCM != null) return; // GPIO-driven, skip
    var va = c.pins[0]._voltage || 0;
    var vb = c.pins[1]._voltage || 0;
    // Piecewise model: LED lit when voltage across it exceeds 70% of Vf
    var Vf_led = parseFloat(c.props.vf) || 2.0;
    var Vd = va - vb;
    c._lit = Vd >= Vf_led * 0.7;
    // Brightness based on current: I = (Vd - Vf) / Ron, Ron=100
    var I_led = c._lit ? Math.max(0, (Vd - Vf_led) / 100.0) : 0;
    c._brightness = Math.min(1.0, I_led / 0.02); // full at 20mA
  });

  // Update 7-seg state from MNA pin voltages
  _components.forEach(function(c) {
    if (c.type !== 'sevenseg') return;
    var isCA = c.props.commonAnode === 'true' || c.props.commonAnode === true;
    c._segState = c._segState || {};
    var pinToSeg = window.Components.COMPONENT_REGISTRY.sevenseg._pinToSeg;
    c.pins.forEach(function(pin, i) {
      var segName = pinToSeg ? pinToSeg[i] : null;
      if (!segName) return; // skip COM pins
      var hi = (pin._voltage || 0) > 1.5;
      // Common cathode (default): segment ON when pin HIGH
      // Common anode: segment ON when pin LOW
      c._segState[segName] = isCA ? !hi : hi;
    });
  });

  // --- FIX: ADDED BLOCK ---
  // Read simulated analog voltages and translate them to digital GPIO inputs
  _components.forEach(function(c) {
    if (c.type !== 'gpiopin') return;
    
    var bcm = parseInt(c.props.bcm);
    if (isNaN(bcm)) return;

    // Only process pins that Python has configured as an INput
    if (c._gpioMode === 'IN') {
      // Read the voltage solved by MNA (assuming 1.5V+ is a logic HIGH)
      var simVolts = c.pins[0]._voltage || 0;
      var simLogic = simVolts > 1.5 ? 1 : 0;

      // If the logic level changed since the last frame, notify the Python backend
      if (c._lastSimLogic !== simLogic) {
        c._lastSimLogic = simLogic;
        if (window.electronAPI && window.electronAPI.injectGPIO) {
          window.electronAPI.injectGPIO({ 
            type: 'gpio', 
            action: 'inject', 
            pin: bcm, 
            value: simLogic 
          });
        }
      }
    }
  });
  // --- END FIX ---
}

// ── Mouse ─────────────────────────────────────────────────────────────────────
function _onMouseDown(e) {
  // Middle mouse button → start panning
  if (e.button === 1) {
    e.preventDefault();
    _panning    = true;
    _panStart   = _rawPos(e);
    _panOrigin  = { x: _panX, y: _panY };
    _canvas.style.cursor = 'grabbing';
    return;
  }

  var pos = _cpos(e);

  if (_tool === 'select') {
    // In select mode, if mousedown lands on a pin → start wiring immediately
    // This lets you drag wires without switching tools
    var pinUnderCursor = _pinHit(pos);
    if (pinUnderCursor) {
      var c_pw = _getComp(pinUnderCursor.compId);
      var pd_pw = c_pw.def.pins[pinUnderCursor.pinIdx];
      _wiringFrom = {
        compId: pinUnderCursor.compId,
        pinIdx: pinUnderCursor.pinIdx,
        x: c_pw.x + pd_pw.gx * GRID,
        y: c_pw.y + pd_pw.gy * GRID,
      };
      return; // don't start component drag
    }
  }

  if (_tool === 'select') {
    _selectedWire = null;
    var comp = _hitTest(pos);
    if (comp) {
      // Check if click is on a keypad button
      if (comp.type === 'keypad4x4') {
        var kp = _getKeypadButton(comp, pos);
        if (kp) {
          // Press this button, store which keypad we pressed for mouseup release
          comp._pressed = { row: kp.row, col: kp.col };
          _activeKeypad = comp.id;
          return; // don't start drag
        }
      }
      if (_selectedIds.indexOf(comp.id) < 0) _selectedIds = [comp.id];
      _dragging = { compId: comp.id, offX: pos.x - comp.x, offY: pos.y - comp.y };
      _showProps(comp);
    } else {
      var wire = null;
      for (var i = 0; i < _wires.length; i++) { if (_wireHit(_wires[i], pos)) { wire = _wires[i]; break; } }
      if (wire) { _selectedWire = wire; _selectedIds = []; _hideProps(); }
      else { _selectedIds = []; _hideProps(); }
    }
  }

  if (_tool === 'wire') {
    var pin = _pinHit(pos);
    if (pin) {
      var c = _getComp(pin.compId);
      var pd = c.def.pins[pin.pinIdx];
      _wiringFrom = { compId: pin.compId, pinIdx: pin.pinIdx, x: c.x+pd.gx*GRID, y: c.y+pd.gy*GRID };
    }
  }

  if (_tool === 'delete') {
    var dc = _hitTest(pos);
    if (dc) { _deleteComp(dc.id); return; }
    for (var i = _wires.length-1; i >= 0; i--) { if (_wireHit(_wires[i], pos)) { _deleteWire(i); break; } }
  }
}

function _onMouseMove(e) {
  // Pan with middle mouse
  if (_panning && _panStart) {
    var raw = _rawPos(e);
    _panX = _panOrigin.x + (raw.x - _panStart.x);
    _panY = _panOrigin.y + (raw.y - _panStart.y);
    _canvas.style.cursor = 'grabbing';
    return;
  }
  _mousePos = _cpos(e);
  _hoverComp = _hitTest(_mousePos);
  _hoverPin  = _hoverComp ? _pinHit(_mousePos) : null;
  if (_dragging && _tool === 'select') {
    var c = _getComp(_dragging.compId);
    if (c) { c.x = _snap(_mousePos.x - _dragging.offX); c.y = _snap(_mousePos.y - _dragging.offY); }
  }
  _canvas.style.cursor = _dragging ? 'grabbing' : _hoverComp ? 'grab' : 'default';
}

function _onMouseUp(e) {
  if (_panning) {
    _panning   = false;
    _panStart  = null;
    _panOrigin = null;
    _canvas.style.cursor = 'default';
    return;
  }
  _dragging = null;

  // Release any held keypad button
  if (_activeKeypad) {
    var kc = _getComp(_activeKeypad);
    if (kc) kc._pressed = null;
    _activeKeypad = null;
  }

  if (_wiringFrom) {
    var pin = _pinHit(_cpos(e));
    if (pin && !(pin.compId === _wiringFrom.compId && pin.pinIdx === _wiringFrom.pinIdx)) {
      _addWire(_wiringFrom, pin);
    }
    _wiringFrom = null;  // always cancel — works in both select and wire mode
  }
}

function _onDblClick(e) {
  var c = _hitTest(_cpos(e));
  if (c && c.type === 'switch') _toggleSwitch(c);
}

function _onRightClick(e) {
  e.preventDefault();
  var c = _hitTest(_cpos(e));
  if (c) { _selectedIds = [c.id]; _showProps(c, _cpos(e)); }
}

function _onWheel(e) {
  e.preventDefault();
  var raw = _rawPos(e);
  var delta = e.deltaY > 0 ? 0.9 : 1.1;
  var newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, _zoom * delta));
  // Zoom toward cursor position
  var worldX = (raw.x - _panX) / _zoom;
  var worldY = (raw.y - _panY) / _zoom;
  _zoom = newZoom;
  _panX = raw.x - worldX * _zoom;
  _panY = raw.y - worldY * _zoom;
}

function _resetView() {
  _panX = 0; _panY = 0; _zoom = 1.0;
}

function _onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'v' || e.key === 'V') _setTool('select');
  if (e.key === 'w' || e.key === 'W') _setTool('wire');
  if (e.key === 'Escape') { _wiringFrom = null; _setTool('select'); }
  // Zoom shortcuts
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); _zoom = Math.min(MAX_ZOOM, _zoom * 1.2); }
  if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); _zoom = Math.max(MIN_ZOOM, _zoom / 1.2); }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); _resetView(); }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (_selectedWire) {
      var wi = _wires.indexOf(_selectedWire);
      if (wi >= 0) _deleteWire(wi);
      _selectedWire = null;
    }
    var ids = _selectedIds.slice();
    ids.forEach(function(id) { _deleteComp(id); });
    _selectedIds = [];
  }
}

// ── Wire management ───────────────────────────────────────────────────────────
function _addWire(from, to) {
  var ca = _getComp(from.compId), cb = _getComp(to.compId);
  if (ca) ca.pins[from.pinIdx].connected = true;
  if (cb) cb.pins[to.pinIdx].connected   = true;
  _wires.push({ id:'w_'+Date.now(), from:from, to:to, _voltage:0 });
}

function _deleteWire(idx) {
  var w = _wires[idx];
  _wires.splice(idx, 1);
  _cleanPin(w.from.compId, w.from.pinIdx);
  _cleanPin(w.to.compId,   w.to.pinIdx);
}

function _cleanPin(compId, pinIdx) {
  var still = _wires.some(function(w) {
    return (w.from.compId===compId&&w.from.pinIdx===pinIdx)||(w.to.compId===compId&&w.to.pinIdx===pinIdx);
  });
  var c = _getComp(compId);
  if (c && !still) {
    c.pins[pinIdx].connected = false;
    c.pins[pinIdx]._voltage  = 0;
    c.pins[pinIdx]._node     = 0;
    if (c.type==='led')      { c._lit=false; c._brightness=0; }
    if (c.type==='sevenseg') { c._segState={}; }
  }
}

function _wireHit(w, pos, thresh) {
  thresh = thresh || 7;
  var a = _getPinXY(w.from.compId, w.from.pinIdx);
  var b = _getPinXY(w.to.compId,   w.to.pinIdx);
  if (!a || !b) return false;
  return _segDist(pos,a,{x:b.x,y:a.y}) < thresh || _segDist(pos,{x:b.x,y:a.y},b) < thresh;
}

function _segDist(p, a, b) {
  var dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy;
  if(!l2) return Math.hypot(p.x-a.x,p.y-a.y);
  var t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));
  return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}

// ── Component management ──────────────────────────────────────────────────────
function _addCompCenter(typeId) {
  var reg = window.Components.COMPONENT_REGISTRY;
  var def = reg[typeId];
  if (!def) { console.error('Unknown component type:', typeId); return; }
  var offset = (_components.length % 6) * GRID;
  var x = _snap(Math.max(GRID, _canvas.width  / 2 - def.width  * GRID / 2 + offset));
  var y = _snap(Math.max(GRID, _canvas.height / 2 - def.height * GRID / 2 + offset));
  var c = window.Components.createComponent(typeId, x, y);
  if (!c) return;
  _components.push(c);
  _selectedIds = [c.id];
  _showProps(c);
}

function _deleteComp(id) {
  // Delete attached wires first (reverse order)
  for (var i = _wires.length-1; i >= 0; i--) {
    if (_wires[i].from.compId === id || _wires[i].to.compId === id) _deleteWire(i);
  }
  _components = _components.filter(function(c) { return c.id !== id; });
  _hideProps();
}

function _toggleSwitch(comp) {
  var was = comp.props.closed === true || comp.props.closed === 'true';
  comp.props.closed = !was;
  if (window.electronAPI && comp.connectedBCM != null) {
    window.electronAPI.injectGPIO({ type:'gpio', action:'inject', pin:comp.connectedBCM, value:comp.props.closed?1:0 });
  }
}

function _clearCanvas() {
  _components = []; _wires = []; _selectedIds = []; _selectedWire = null; _wiringFrom = null;
  _hideProps();
}

// ── Props popover ─────────────────────────────────────────────────────────────
function _showProps(comp, pos) {
  var pop  = document.getElementById('prop-popover');
  var body = document.getElementById('prop-body');
  document.getElementById('prop-title').textContent = comp.def.label;
  body.innerHTML = '';

  (comp.def.props || []).forEach(function(schema) {
    var row = document.createElement('div'); row.className = 'prop-row';
    var lbl = document.createElement('label'); lbl.className = 'prop-label'; lbl.textContent = schema.label;
    var inp;
    if (schema.type === 'select') {
      inp = document.createElement('select'); inp.className = 'prop-select';
      (schema.options || []).forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = opt.textContent = o;
        if (String(comp.props[schema.key]) === o) opt.selected = true;
        inp.appendChild(opt);
      });
      inp.onchange = function() { comp.props[schema.key] = inp.value; };
    } else {
      inp = document.createElement('input'); inp.className = 'prop-input';
      inp.type = schema.type === 'number' ? 'number' : 'text';
      inp.value = comp.props[schema.key] !== undefined ? comp.props[schema.key] : '';
      if (schema.min != null) inp.min = schema.min;
      if (schema.max != null) inp.max = schema.max;
      inp.oninput = (function(s) { return function() {
        comp.props[s.key] = s.type === 'number' ? (parseFloat(inp.value)||0) : inp.value;
      }; })(schema);
    }
    row.appendChild(lbl); row.appendChild(inp); body.appendChild(row);
  });

  // GPIO selector
  var gr = document.createElement('div'); gr.className = 'prop-row';
  var gl = document.createElement('label'); gl.className = 'prop-label'; gl.textContent = 'GPIO (BCM)';
  var gs = document.createElement('select'); gs.className = 'prop-select';
  var no = document.createElement('option'); no.value=''; no.textContent='— none —'; gs.appendChild(no);
  var pins = window.PinMap ? window.PinMap.RPI4_PINS : [];
  pins.forEach(function(p) {
    var o = document.createElement('option'); o.value=p.bcm; o.textContent='GPIO'+p.bcm;
    if (comp.connectedBCM === p.bcm) o.selected = true;
    gs.appendChild(o);
  });
  gs.onchange = function() { comp.connectedBCM = gs.value ? parseInt(gs.value) : null; };
  gr.appendChild(gl); gr.appendChild(gs); body.appendChild(gr);

  // Position — convert world coords to screen coords accounting for pan/zoom
  var rect = document.getElementById('canvas-panel').getBoundingClientRect();
  // World-to-screen: screenX = worldX * zoom + panX + canvasLeft
  var canvasRect = _canvas.getBoundingClientRect();
  function worldToScreen(wx, wy) {
    return {
      x: wx * _zoom + _panX + canvasRect.left,
      y: wy * _zoom + _panY + canvasRect.top
    };
  }
  var screenPos;
  if (pos) {
    // pos is already in world coords (from _cpos), convert to screen
    screenPos = worldToScreen(pos.x, pos.y);
  } else {
    // Position popover to the right of the component
    var rightEdge = comp.x + comp.def.width * GRID + 15;
    screenPos = worldToScreen(rightEdge, comp.y);
  }
  var px = Math.min(screenPos.x, window.innerWidth  - 265);
  var py = Math.min(Math.max(screenPos.y, 40), window.innerHeight - 320);
  pop.style.left = px + 'px';
  pop.style.top  = py + 'px';
  pop.classList.remove('hidden');
}

function _hideProps() { document.getElementById('prop-popover').classList.add('hidden'); }

// ── GPIO update ───────────────────────────────────────────────────────────────
function _onGPIOUpdate(bcm, state) {
  _components.forEach(function(c) {
    if (c.connectedBCM !== bcm) return;
    if (c.def.onGPIO) c.def.onGPIO(c, bcm, state);
    if (c.type === 'switch') c.props.closed = state.value === 1;
  });
}

function _selectPin(bcm) {
  var c = _components.find(function(c) { return c.connectedBCM === bcm; });
  if (c) { _selectedIds = [c.id]; _showProps(c); }
}

// ── Tool switching ────────────────────────────────────────────────────────────
function _setTool(t) {
  _tool = t; _wiringFrom = null;
  document.querySelectorAll('.tool-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tool === t);
  });
}

// ── Panel resize ──────────────────────────────────────────────────────────────
function _initPanelResize() {
  _addResizer('pin-panel', 'canvas-panel');
  _addResizer('canvas-panel', 'code-panel');
}

function _addResizer(leftId, rightId) {
  var left = document.getElementById(leftId), right = document.getElementById(rightId);
  if (!left || !right) return;
  var h = document.createElement('div'); h.className = 'resize-handle resize-h'; left.after(h);
  var startX, startLW, startRW;
  h.addEventListener('mousedown', function(e) {
    e.preventDefault(); startX=e.clientX; startLW=left.offsetWidth; startRW=right.offsetWidth;
    function mv(e) {
      var dx=e.clientX-startX;
      var nl=Math.max(120,startLW+dx), nr=Math.max(120,startRW-dx);
      left.style.width=nl+'px'; left.style.minWidth=nl+'px';
      right.style.width=nr+'px'; right.style.minWidth=nr+'px';
      _resizeCanvas();
    }
    function up() { document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); }
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
  });
}

// ── Keypad button hit test ────────────────────────────────────────────────────
function _getKeypadButton(comp, pos) {
  var x = comp.x, y = comp.y, g = window.Components.GRID;
  var bx = x + g, by = y + g;
  var bw = g * 8, bh = g * 10;
  var gridX = bx + g * 0.6;
  var gridY = by + g * 1.8;
  var cellW = (bw - g * 1.2) / 4;
  var cellH = (bh - g * 2.2) / 4;
  for (var row = 0; row < 4; row++) {
    for (var col = 0; col < 4; col++) {
      var btnX = gridX + col * cellW;
      var btnY = gridY + row * cellH;
      var bw2  = cellW - g * 0.25;
      var bh2  = cellH - g * 0.25;
      if (pos.x >= btnX && pos.x <= btnX + bw2 &&
          pos.y >= btnY && pos.y <= btnY + bh2) {
        return { row: row, col: col };
      }
    }
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Raw canvas position (screen space, before pan/zoom)
function _rawPos(e) { var r=_canvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
// World position (after removing pan/zoom transform)
function _cpos(e) {
  var r = _canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - _panX) / _zoom,
    y: (e.clientY - r.top  - _panY) / _zoom
  };
}
function _snap(v) { return Math.round(v/GRID)*GRID; }
function _getComp(id) { for(var i=0;i<_components.length;i++){if(_components[i].id===id)return _components[i];} return null; }
function _getPinXY(cid, pi) {
  var c=_getComp(cid); if(!c||pi>=c.def.pins.length)return null;
  var p=c.def.pins[pi]; return {x:c.x+p.gx*GRID,y:c.y+p.gy*GRID};
}
function _hitTest(pos) {
  for(var i=_components.length-1;i>=0;i--){
    var c=_components[i], w=c.def.width*GRID, h=c.def.height*GRID;
    if(pos.x>=c.x-8&&pos.x<=c.x+w+8&&pos.y>=c.y-8&&pos.y<=c.y+h+8) return c;
  } return null;
}
function _pinHit(pos, thresh) {
  thresh=thresh||9;
  for(var i=0;i<_components.length;i++){
    var c=_components[i];
    for(var j=0;j<c.def.pins.length;j++){
      var p=c.def.pins[j];
      if(Math.hypot(pos.x-(c.x+p.gx*GRID),pos.y-(c.y+p.gy*GRID))<=thresh)
        return {compId:c.id,pinIdx:j};
    }
  } return null;
}

// ── Public API ────────────────────────────────────────────────────────────────
window.CircuitCanvas = {
  init:           canvasInit,
  onGPIOUpdate:   _onGPIOUpdate,
  selectPin:      _selectPin,
  clearCanvas:    _clearCanvas,
  getComponents:  function() { return _components; },
  resetView:      _resetView,
  getWires:       function() { return _wires; },
};


// ── Circuit save ──────────────────────────────────────────────────────────────
function _saveCircuit() {
  // Serialize components — save all user-facing props and positions
  var compData = _components.map(function(c) {
    return {
      id:           c.id,
      type:         c.type,
      x:            c.x,
      y:            c.y,
      props:        JSON.parse(JSON.stringify(c.props)),
      connectedBCM: c.connectedBCM,
      connectedPins:c.connectedPins,
      // IC state
      _state:       c._state ? c._state.slice() : undefined,
      _prevCK:      c._prevCK,
      _ocLow:       c._ocLow,
      // GPIO pin state
      _gpioMode:    c._gpioMode,
      _gpioValue:   c._gpioValue,
      _gpioPWM:     c._gpioPWM,
      _lastSimLogic:c._lastSimLogic,
    };
  });

  // Serialize wires
  var wireData = _wires.map(function(w) {
    return {
      id:   w.id,
      from: { compId: w.from.compId, pinIdx: w.from.pinIdx },
      to:   { compId: w.to.compId,   pinIdx: w.to.pinIdx   },
    };
  });

  return { version: 1, components: compData, wires: wireData };
}

// ── Circuit load ──────────────────────────────────────────────────────────────
function _loadCircuit(data) {
  if (!data || !data.components) { console.error('Invalid circuit file'); return; }

  _clearCanvas();

  var reg = window.Components.COMPONENT_REGISTRY;

  // Restore components
  data.components.forEach(function(cd) {
    var def = reg[cd.type];
    if (!def) { console.warn('Unknown component type:', cd.type); return; }

    var comp = window.Components.createComponent(cd.type, cd.x, cd.y);
    // Preserve original ID so wire references still work
    comp.id           = cd.id;
    comp.props        = Object.assign(comp.props, cd.props || {});
    comp.connectedBCM = cd.connectedBCM !== undefined ? cd.connectedBCM : null;
    comp.connectedPins= cd.connectedPins || [];
    if (cd._state)  comp._state  = cd._state.slice();
    if (cd._prevCK     !== undefined) comp._prevCK     = cd._prevCK;
    if (cd._ocLow      !== undefined) comp._ocLow      = cd._ocLow;
    if (cd._gpioMode   !== undefined) comp._gpioMode   = cd._gpioMode;
    if (cd._gpioValue  !== undefined) comp._gpioValue  = cd._gpioValue;
    if (cd._gpioPWM    !== undefined) comp._gpioPWM    = cd._gpioPWM;
    if (cd._lastSimLogic !== undefined) comp._lastSimLogic = cd._lastSimLogic;

    _components.push(comp);
  });

  // Restore wires — reconnect using saved component IDs
  data.wires.forEach(function(wd) {
    var ca = _getComp(wd.from.compId);
    var cb = _getComp(wd.to.compId);
    if (!ca || !cb) { console.warn('Wire references missing component', wd); return; }
    ca.pins[wd.from.pinIdx].connected = true;
    cb.pins[wd.to.pinIdx].connected   = true;
    _wires.push({
      id:   wd.id,
      from: { compId: wd.from.compId, pinIdx: wd.from.pinIdx },
      to:   { compId: wd.to.compId,   pinIdx: wd.to.pinIdx   },
      _voltage: 0,
    });
  });

  console.log('[circuit] loaded:', _components.length, 'components,', _wires.length, 'wires');
}

// Expose on public API
window.CircuitCanvas.saveCircuit = _saveCircuit;
window.CircuitCanvas.loadCircuit = _loadCircuit;


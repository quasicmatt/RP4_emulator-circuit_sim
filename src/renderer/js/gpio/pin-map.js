/**
 * pin-map.js — GPIO pin display panel
 *
 * Fix for skipped GPIO writes:
 * Incoming messages are pushed into _pendingMessages[].
 * CircuitCanvas calls PinMap.flushPending() at the START of each
 * MNA frame so ALL queued GPIO state changes are applied before
 * the solver runs — none are ever skipped.
 * * Input Support Added:
 * CircuitCanvas should call PinMap.pollInputs() at the END of each
 * MNA frame to read simulated voltages and send them back to the host.
 */

var RPI4_PINS = [
  {bcm:2,  name:'SDA1 / GPIO2',    type:'i2c' },
  {bcm:3,  name:'SCL1 / GPIO3',    type:'i2c' },
  {bcm:4,  name:'GPIO4',           type:'gpio'},
  {bcm:5,  name:'GPIO5',           type:'gpio'},
  {bcm:6,  name:'GPIO6',           type:'gpio'},
  {bcm:7,  name:'SPI_CE1 / GPIO7', type:'spi' },
  {bcm:8,  name:'SPI_CE0 / GPIO8', type:'spi' },
  {bcm:9,  name:'SPI_MISO / GPIO9',type:'spi' },
  {bcm:10, name:'SPI_MOSI / GPIO10',type:'spi'},
  {bcm:11, name:'SPI_CLK / GPIO11', type:'spi'},
  {bcm:12, name:'GPIO12 (PWM0)',   type:'pwm' },
  {bcm:13, name:'GPIO13 (PWM1)',   type:'pwm' },
  {bcm:14, name:'TXD / GPIO14',    type:'uart'},
  {bcm:15, name:'RXD / GPIO15',    type:'uart'},
  {bcm:16, name:'GPIO16',          type:'gpio'},
  {bcm:17, name:'GPIO17',          type:'gpio'},
  {bcm:18, name:'GPIO18 (PWM0)',   type:'pwm' },
  {bcm:19, name:'GPIO19 (PWM1)',   type:'pwm' },
  {bcm:20, name:'GPIO20',          type:'gpio'},
  {bcm:21, name:'GPIO21',          type:'gpio'},
  {bcm:22, name:'GPIO22',          type:'gpio'},
  {bcm:23, name:'GPIO23',          type:'gpio'},
  {bcm:24, name:'GPIO24',          type:'gpio'},
  {bcm:25, name:'GPIO25',          type:'gpio'},
  {bcm:26, name:'GPIO26',          type:'gpio'},
  {bcm:27, name:'GPIO27',          type:'gpio'},
];

var pinState = {};
RPI4_PINS.forEach(function(p) {
  pinState[p.bcm] = { value: 0, mode: 'IN', pwm: null };
});

// ── Pending message queue ─────────────────────────────────────────────────────
var _pendingMessages = [];

// ── Render pin list ───────────────────────────────────────────────────────────
function renderPinMap() {
  var container = document.getElementById('pin-map');
  if (!container) return;
  container.innerHTML = '';
  RPI4_PINS.forEach(function(pin) {
    var row = document.createElement('div');
    row.className = 'pin-row';
    row.dataset.bcm = pin.bcm;
    var tc = (pin.type !== 'gpio') ? 'special' : '';
    row.innerHTML =
      '<div class="pin-indicator" id="pi-'+pin.bcm+'"></div>' +
      '<span class="pin-num">'+pin.bcm+'</span>' +
      '<span class="pin-name '+tc+'">'+pin.name+'</span>' +
      '<span class="pin-value" id="pv-'+pin.bcm+'">0</span>';
    row.addEventListener('click', function() { onPinClick(pin.bcm); });
    container.appendChild(row);
  });
}

function updatePinDisplay(bcm) {
  var s   = pinState[bcm] || {};
  var ind = document.getElementById('pi-' + bcm);
  var val = document.getElementById('pv-' + bcm);
  var row = document.querySelector('.pin-row[data-bcm="' + bcm + '"]');
  if (!ind || !val || !row) return;

  if (s.pwm != null) {
    ind.className = 'pin-indicator pwm';
    val.textContent = Math.round(s.pwm) + '%';
    val.className = 'pin-value high';
    row.className = 'pin-row high';
  } else {
    var hi = s.value === 1;
    ind.className = 'pin-indicator' + (hi ? ' high' : '');
    val.textContent = hi ? '1' : '0';
    val.className = 'pin-value' + (hi ? ' high' : '');
    row.className = 'pin-row' + (hi ? ' high' : ' low');
  }
}

// ── Apply a single GPIO message to pinState ───────────────────────────────────
function _applyMessage(msg) {
  var bcm = msg.pin;
  if (!(bcm in pinState)) return;
  var s = pinState[bcm];

  switch (msg.action) {
    case 'setup':    s.mode = msg.direction || 'OUT'; s.value = msg.value || 0; break;
    case 'write':    s.value = msg.value; s.pwm = null; break;
    case 'pwm_start':
    case 'pwm_duty': s.pwm = msg.value; break;
    case 'pwm_stop': s.pwm = null; s.value = 0; break;
    case 'cleanup':  s.value = 0; s.pwm = null; break;
  }

  updatePinDisplay(bcm);
}

// ── Flush all pending messages (called by canvas at frame start) ──────────────
function flushPending() {
  if (_pendingMessages.length === 0) return;

  var msgs = _pendingMessages.splice(0);

  // ── Rising edge pre-scan ───────────────────────────────────────────────────
  var risingEdgePins = {};  

  for (var i = 0; i < msgs.length - 1; i++) {
    var m  = msgs[i];
    var m2 = msgs[i + 1];
    if (m.action === 'write' && m2.action === 'write' &&
        m.pin === m2.pin && m.value === 1 && m2.value === 0) {
      risingEdgePins[m.pin] = true;
    }
  }

  if (Object.keys(risingEdgePins).length > 0 && window.CircuitCanvas) {
    window.CircuitCanvas.getComponents().forEach(function(c) {
      if (c.type !== 'gpiopin') return;
      var bcm = parseInt(c.props.bcm);
      if (!risingEdgePins[bcm]) return;
      
      c._gpioValue = 1;
      c.pins[0]._voltage = 3.3;
      
      window.CircuitCanvas.getComponents().forEach(function(ic) {
        if (ic.type !== 'hc374') return;
        var ckNode = ic.pins[10]._node;
        var gpioNode = c.pins[0]._node;
        if (ckNode && gpioNode && ckNode === gpioNode) {
          ic.pins[10]._voltage = 3.3; 
          if (ic.def && ic.def.update) ic.def.update(ic);
        }
      });
    });
  }

  // Apply messages
  msgs.forEach(function(msg) {
    _applyMessage(msg);

    var bcm = msg.pin;
    if (!(bcm in pinState)) return;
    var s = pinState[bcm];

    if (window.CircuitCanvas) {
      window.CircuitCanvas.onGPIOUpdate(bcm, s);
    }

    if (window.CircuitCanvas) {
      window.CircuitCanvas.getComponents().forEach(function(c) {
        if (c.type === 'gpiopin' && parseInt(c.props.bcm) === bcm) {
          c._gpioMode  = s.mode  || 'OUT';
          c._gpioPWM   = s.pwm;
          
          // CHANGE 1: Only force the pin value if the host configured it as an output.
          // This stops the canvas from crushing inputs back to 0.
          if (s.mode !== 'IN') {
            c._gpioValue = s.value || 0;
          }
        }
      });
    }
  });
}

// ── Read Canvas Inputs (called by canvas at frame end) ────────────────────────
// CHANGE 2: Polling function to capture simulation input state and report to host.
function pollInputs() {
  if (!window.CircuitCanvas) return;

  window.CircuitCanvas.getComponents().forEach(function(c) {
    if (c.type !== 'gpiopin') return;

    var bcm = parseInt(c.props.bcm);
    if (!(bcm in pinState)) return;
    var s = pinState[bcm];

    // Only process pins explicitly set to IN
    if (s.mode === 'IN') {
      var simValue = c._gpioValue || 0;

      // If the simulator triggered a logic change, capture it and notify backend
      if (simValue !== s.value) {
        s.value = simValue;
        updatePinDisplay(bcm);

        // CHANGE 3: Expose hook for IPC bridge. 
        // Implement window.sendGPIOInputMessage in your main IPC handler to route this to the Pi.
        if (window.sendGPIOInputMessage) {
          window.sendGPIOInputMessage({ pin: bcm, action: 'read', value: simValue });
        }
      }
    }
  });
}

// ── Receive a GPIO message from IPC (non-blocking — just enqueue) ─────────────
function handleGPIOMessage(msg) {
  _pendingMessages.push(msg);
}

// ── Pin click: add GPIO pin component to canvas ───────────────────────────────
function onPinClick(bcm) {
  if (!window.CircuitCanvas || !window.Components) return;

  var existing = null;
  window.CircuitCanvas.getComponents().forEach(function(c) {
    if (c.type === 'gpiopin' && parseInt(c.props.bcm) === bcm) existing = c;
  });

  if (existing) {
    window.CircuitCanvas.selectPin(bcm);
    return;
  }

  var idx  = RPI4_PINS.findIndex(function(p) { return p.bcm === bcm; });
  var comp = window.Components.createComponent('gpiopin', 20, 20 + idx * 60);
  if (!comp) return;
  comp.props.bcm    = bcm;
  comp.props.label  = 'GPIO' + bcm;
  comp.connectedBCM = bcm;
  comp._gpioMode    = pinState[bcm] ? (pinState[bcm].mode  || 'OUT') : 'OUT';
  comp._gpioValue   = pinState[bcm] ? (pinState[bcm].value || 0)     : 0;
  comp._gpioPWM     = pinState[bcm] ?  pinState[bcm].pwm             : null;
  window.CircuitCanvas.getComponents().push(comp);
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderPinMap();

window.PinMap = {
  handleGPIOMessage: handleGPIOMessage,
  flushPending:      flushPending,
  pollInputs:        pollInputs, // Exported so CircuitCanvas can hook it
  pinState:          pinState,
  RPI4_PINS:         RPI4_PINS,
};
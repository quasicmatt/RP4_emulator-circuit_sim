/**
 * pin-map.js — GPIO pin display panel
 * Depends on: components.js (window.Components) — loaded after it
 */

var RPI4_PINS = [
  {bcm:2,  name:'SDA1 / GPIO2',   type:'i2c' },
  {bcm:3,  name:'SCL1 / GPIO3',   type:'i2c' },
  {bcm:4,  name:'GPIO4',          type:'gpio'},
  {bcm:5,  name:'GPIO5',          type:'gpio'},
  {bcm:6,  name:'GPIO6',          type:'gpio'},
  {bcm:7,  name:'SPI_CE1 / GPIO7',type:'spi' },
  {bcm:8,  name:'SPI_CE0 / GPIO8',type:'spi' },
  {bcm:9,  name:'SPI_MISO / GPIO9',type:'spi'},
  {bcm:10, name:'SPI_MOSI / GPIO10',type:'spi'},
  {bcm:11, name:'SPI_CLK / GPIO11',type:'spi'},
  {bcm:12, name:'GPIO12 (PWM0)',  type:'pwm' },
  {bcm:13, name:'GPIO13 (PWM1)',  type:'pwm' },
  {bcm:14, name:'TXD / GPIO14',   type:'uart'},
  {bcm:15, name:'RXD / GPIO15',   type:'uart'},
  {bcm:16, name:'GPIO16',         type:'gpio'},
  {bcm:17, name:'GPIO17',         type:'gpio'},
  {bcm:18, name:'GPIO18 (PWM0)',  type:'pwm' },
  {bcm:19, name:'GPIO19 (PWM1)',  type:'pwm' },
  {bcm:20, name:'GPIO20',         type:'gpio'},
  {bcm:21, name:'GPIO21',         type:'gpio'},
  {bcm:22, name:'GPIO22',         type:'gpio'},
  {bcm:23, name:'GPIO23',         type:'gpio'},
  {bcm:24, name:'GPIO24',         type:'gpio'},
  {bcm:25, name:'GPIO25',         type:'gpio'},
  {bcm:26, name:'GPIO26',         type:'gpio'},
  {bcm:27, name:'GPIO27',         type:'gpio'},
];

var pinState = {};
RPI4_PINS.forEach(function(p) { pinState[p.bcm] = {value:0, mode:'IN', pwm:null}; });

// ── Render pin list ───────────────────────────────────────────────────────────
function renderPinMap() {
  var container = document.getElementById('pin-map');
  if (!container) return;
  container.innerHTML = '';
  RPI4_PINS.forEach(function(pin) {
    var row = document.createElement('div');
    row.className = 'pin-row';
    row.dataset.bcm = pin.bcm;
    var tc = (pin.type === 'pwm' || pin.type === 'i2c' || pin.type === 'spi' || pin.type === 'uart') ? 'special' : '';
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
  var ind = document.getElementById('pi-'+bcm);
  var val = document.getElementById('pv-'+bcm);
  var row = document.querySelector('.pin-row[data-bcm="'+bcm+'"]');
  if (!ind || !val || !row) return;
  if (s.pwm != null) {
    ind.className = 'pin-indicator pwm';
    val.textContent = Math.round(s.pwm)+'%';
    val.className = 'pin-value high';
    row.className = 'pin-row high';
  } else {
    var hi = s.value === 1;
    ind.className = 'pin-indicator' + (hi?' high':'');
    val.textContent = hi ? '1' : '0';
    val.className = 'pin-value' + (hi?' high':'');
    row.className = 'pin-row' + (hi?' high':' low');
  }
}

// ── Handle GPIO message from Python ──────────────────────────────────────────
function handleGPIOMessage(msg) {
  var bcm = msg.pin;
  if (!(bcm in pinState)) return;
  var s = pinState[bcm];
  switch (msg.action) {
    case 'setup':  s.mode=msg.direction||'OUT'; s.value=msg.value||0; break;
    case 'write':  s.value=msg.value; s.pwm=null; break;
    case 'pwm_start': case 'pwm_duty': s.pwm=msg.value; break;
    case 'pwm_stop':  s.pwm=null; s.value=0; break;
    case 'cleanup':   s.value=0; s.pwm=null; break;
  }
  updatePinDisplay(bcm);

  // Forward to circuit canvas
  if (window.CircuitCanvas) window.CircuitCanvas.onGPIOUpdate(bcm, s);

  // Sync any gpiopin components on canvas
  if (window.CircuitCanvas) {
    window.CircuitCanvas.getComponents().forEach(function(c) {
      if (c.type === 'gpiopin' && parseInt(c.props.bcm) === bcm) {
        c._gpioMode  = s.mode  || 'OUT';
        c._gpioValue = s.value || 0;
        c._gpioPWM   = s.pwm;
      }
    });
  }
}

// ── Pin click: add GPIO pin component to canvas ───────────────────────────────
function onPinClick(bcm) {
  if (!window.CircuitCanvas || !window.Components) return;
  // Check if already on canvas
  var existing = null;
  window.CircuitCanvas.getComponents().forEach(function(c) {
    if (c.type === 'gpiopin' && parseInt(c.props.bcm) === bcm) existing = c;
  });
  if (existing) {
    window.CircuitCanvas.selectPin(bcm);
    return;
  }
  // Place a new GPIO pin component
  var idx  = RPI4_PINS.findIndex(function(p) { return p.bcm === bcm; });
  var comp = window.Components.createComponent('gpiopin', 20, 20 + idx * 60);
  if (!comp) return;
  comp.props.bcm   = bcm;
  comp.props.label = 'GPIO'+bcm;
  comp.connectedBCM = bcm;
  comp._gpioMode   = pinState[bcm] ? (pinState[bcm].mode||'OUT') : 'OUT';
  comp._gpioValue  = pinState[bcm] ? (pinState[bcm].value||0)    : 0;
  comp._gpioPWM    = pinState[bcm] ? pinState[bcm].pwm : null;
  window.CircuitCanvas.getComponents().push(comp);
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderPinMap();

window.PinMap = { handleGPIOMessage: handleGPIOMessage, pinState: pinState, RPI4_PINS: RPI4_PINS };

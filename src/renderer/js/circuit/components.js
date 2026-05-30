/**
 * components.js  — Component definitions and registry
 * Loaded FIRST among circuit files. Sets window.Components.
 */

// ── Shared constant ───────────────────────────────────────────────────────────
var GRID = 20;  // use var so it is truly global, not block-scoped

// ── Drawing helpers ───────────────────────────────────────────────────────────
function _pin(ctx, x, y, connected) {
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = connected ? '#4ade80' : '#30363d';
  ctx.fill();
}

function _label(ctx, text, x, y) {
  ctx.font = '10px "JetBrains Mono",monospace';
  ctx.fillStyle = '#8b949e';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function _formatR(r) {
  if (r >= 1e6) return (r/1e6).toFixed(1)+'MΩ';
  if (r >= 1e3) return (r/1e3).toFixed(1)+'kΩ';
  return r+'Ω';
}
function _formatC(c) {
  if (c >= 1e-3) return (c*1e3).toFixed(0)+'mF';
  if (c >= 1e-6) return (c*1e6).toFixed(0)+'µF';
  if (c >= 1e-9) return (c*1e9).toFixed(0)+'nF';
  return (c*1e12).toFixed(0)+'pF';
}

// ── LED colors ────────────────────────────────────────────────────────────────
var LED_COLORS = { red:'#f87171', green:'#4ade80', yellow:'#fbbf24', blue:'#60a5fa', white:'#f0f0f0' };

// ══════════════════════════════════════════════════════════════════════════════
// RESISTOR
// ══════════════════════════════════════════════════════════════════════════════
var Resistor = {
  id:'resistor', label:'Resistor', width:4, height:2,
  pins:[{name:'A',gx:0,gy:1},{name:'B',gx:4,gy:1}],
  defaults:{resistance:1000, label:'R'},
  props:[
    {key:'label',      label:'Label',      type:'text'},
    {key:'resistance', label:'Resistance', type:'number', unit:'Ω', min:0.1, max:1e9},
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID, cy=y+g, cx=x+2*g;
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(x+g*0.8,cy);
    ctx.moveTo(x+g*3.2,cy); ctx.lineTo(x+4*g,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    var bx=x+g*0.8, bw=g*2.4, bh=g*0.6, seg=7;
    ctx.beginPath(); ctx.moveTo(bx,cy);
    for(var i=0;i<=seg;i++){ctx.lineTo(bx+(bw/seg)*i, cy+(i%2===0?-bh:bh));}
    ctx.lineTo(bx+bw,cy);
    ctx.strokeStyle=comp.selected?'#4ade80':'#60a5fa'; ctx.lineWidth=1.5; ctx.stroke();
    _pin(ctx,x,cy,comp.pins[0].connected);
    _pin(ctx,x+4*g,cy,comp.pins[1].connected);
    _label(ctx,(comp.props.label||'R')+' '+_formatR(comp.props.resistance||1000), cx, cy-g*0.8);
  },
  mnaStamp: function(comp, na, nb, G) {
    var g=1/Math.max(comp.props.resistance||1000, 0.001);
    if(na>0) G[na-1][na-1]+=g;
    if(nb>0) G[nb-1][nb-1]+=g;
    if(na>0&&nb>0){G[na-1][nb-1]-=g; G[nb-1][na-1]-=g;}
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// LED
// ══════════════════════════════════════════════════════════════════════════════
var LED = {
  id:'led', label:'LED', width:3, height:2,
  pins:[{name:'A',gx:0,gy:1},{name:'K',gx:3,gy:1}],
  defaults:{color:'red', vf:2.0, n:1.8, Is:'4.303e-21', label:'D'},
  props:[
    {key:'label', label:'Label',       type:'text'},
    {key:'color', label:'Color',       type:'select', options:['red','green','yellow','blue','white']},
    {key:'n',     label:'Emission (n)',type:'number', min:1.0, max:3.0},
    {key:'Is',    label:'Is (A)',      type:'text'},
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID, cy=y+g, cx=x+1.5*g;
    var hw=g*0.65, color=LED_COLORS[comp.props.color]||LED_COLORS.red;
    var lit=comp._lit||false, bright=comp._brightness||0;
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(x+g*0.85,cy);
    ctx.moveTo(x+g*2.15,cy); ctx.lineTo(x+3*g,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Triangle
    ctx.beginPath();
    ctx.moveTo(x+g*0.85,cy-hw); ctx.lineTo(x+g*0.85,cy+hw); ctx.lineTo(x+g*2.15,cy);
    ctx.closePath();
    ctx.fillStyle=lit?color+'cc':color+'33';
    ctx.fill(); ctx.strokeStyle=lit?color:color+'88'; ctx.lineWidth=1.5; ctx.stroke();
    // Cathode bar
    ctx.beginPath(); ctx.moveTo(x+g*2.15,cy-hw); ctx.lineTo(x+g*2.15,cy+hw);
    ctx.strokeStyle=lit?color:color+'88'; ctx.lineWidth=2; ctx.stroke();
    // Glow
    if(lit){
      var grad=ctx.createRadialGradient(cx,cy,2,cx,cy,g*1.4);
      grad.addColorStop(0,color+'55'); grad.addColorStop(1,color+'00');
      ctx.beginPath(); ctx.arc(cx,cy,g*1.4,0,Math.PI*2);
      ctx.fillStyle=grad; ctx.fill();
    }
    _pin(ctx,x,cy,comp.pins[0].connected);
    _pin(ctx,x+3*g,cy,comp.pins[1].connected);
    _label(ctx,comp.props.label||'D',cx,cy+g*0.95);
  },
  mnaStamp: function(comp, na, nb, G) {
    var g=1/15;
    if(na>0) G[na-1][na-1]+=g;
    if(nb>0) G[nb-1][nb-1]+=g;
    if(na>0&&nb>0){G[na-1][nb-1]-=g; G[nb-1][na-1]-=g;}
  },
  onGPIO: function(comp, bcm, state) {
    if(state.pwm!=null){comp._lit=state.pwm>5; comp._brightness=state.pwm/100;}
    else{comp._lit=state.value===1; comp._brightness=state.value===1?1:0;}
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// CAPACITOR
// ══════════════════════════════════════════════════════════════════════════════
var Capacitor = {
  id:'capacitor', label:'Capacitor', width:4, height:2,
  pins:[{name:'+',gx:0,gy:1},{name:'-',gx:4,gy:1}],
  defaults:{capacitance:100e-6, label:'C', polar:false},
  props:[
    {key:'label',       label:'Label',    type:'text'},
    {key:'capacitance', label:'Value (F)',type:'number', min:1e-12, max:1},
    {key:'polar',       label:'Polar',    type:'select', options:['false','true']},
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID, cy=y+g, cx=x+2*g, ph=g*0.65, gap=g*0.18;
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(cx-gap,cy);
    ctx.moveTo(cx+gap,cy); ctx.lineTo(x+4*g,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-gap,cy-ph); ctx.lineTo(cx-gap,cy+ph);
    ctx.moveTo(cx+gap,cy-ph); ctx.lineTo(cx+gap,cy+ph);
    ctx.strokeStyle=comp.selected?'#4ade80':'#60a5fa'; ctx.lineWidth=2.5; ctx.stroke();
    _pin(ctx,x,cy,comp.pins[0].connected);
    _pin(ctx,x+4*g,cy,comp.pins[1].connected);
    _label(ctx,(comp.props.label||'C')+' '+_formatC(comp.props.capacitance||100e-6),cx,cy-g*0.85);
  },
  mnaStamp: function(comp, na, nb, G) { /* DC open circuit */ },
};

// ══════════════════════════════════════════════════════════════════════════════
// SWITCH
// ══════════════════════════════════════════════════════════════════════════════
var Switch = {
  id:'switch', label:'Switch', width:3, height:2,
  pins:[{name:'A',gx:0,gy:1},{name:'B',gx:3,gy:1}],
  defaults:{closed:false, label:'SW', momentary:true},
  props:[
    {key:'label',     label:'Label',     type:'text'},
    {key:'momentary', label:'Momentary', type:'select', options:['true','false']},
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID, cy=y+g;
    var closed=comp.props.closed===true||comp.props.closed==='true';
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(x+g*0.8,cy);
    ctx.moveTo(x+g*2.2,cy); ctx.lineTo(x+3*g,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x+g*0.8,cy,3.5,0,Math.PI*2);
    ctx.arc(x+g*2.2,cy,3.5,0,Math.PI*2);
    ctx.fillStyle=closed?'#4ade80':'#8b949e'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+g*0.8,cy);
    ctx.lineTo(x+g*2.2, closed?cy:cy-g*0.6);
    ctx.strokeStyle=closed?'#4ade80':'#8b949e'; ctx.lineWidth=2; ctx.stroke();
    _pin(ctx,x,cy,comp.pins[0].connected);
    _pin(ctx,x+3*g,cy,comp.pins[1].connected);
    _label(ctx,(comp.props.label||'SW')+(closed?' ●':' ○'),x+1.5*g,cy-g*0.85);
  },
  mnaStamp: function(comp, na, nb, G) {
    var closed=comp.props.closed===true||comp.props.closed==='true';
    if(!closed) return;
    var g=1/0.001;
    if(na>0) G[na-1][na-1]+=g;
    if(nb>0) G[nb-1][nb-1]+=g;
    if(na>0&&nb>0){G[na-1][nb-1]-=g; G[nb-1][na-1]-=g;}
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// SEVEN SEGMENT DISPLAY
// ══════════════════════════════════════════════════════════════════════════════
var SevenSeg = {
  id:'sevenseg', label:'7-Segment Display',
  width:6, height:8,
  // Pins match standard 10-pin 7-seg DIP package:
  // Top row R->L: pin6=b, pin7=a, pin8=COM, pin9=f, pin10=g  (gx: 0,1,2,4,5  gy:0)
  // Bot row L->R: pin1=e, pin2=d, pin3=COM, pin4=c, pin5=dp  (gx: 0,1,2,4,5  gy:8)
  pins:[
    {name:'e(1)',   gx:1, gy:8},
    {name:'d(2)',   gx:2, gy:8},
    {name:'COM(3)', gx:3, gy:8},
    {name:'c(4)',   gx:4, gy:8},
    {name:'dp(5)',  gx:5, gy:8},
    {name:'b(6)',   gx:5, gy:0},
    {name:'a(7)',   gx:4, gy:0},
    {name:'COM(8)', gx:3, gy:0},
    {name:'f(9)',   gx:2, gy:0},
    {name:'g(10)',  gx:1, gy:0},
  ],
  _pinToSeg: ['e','d',null,'c','dp','b','a',null,'f','g'],
  defaults:{label:'U', color:'red', commonAnode:'false'},
  props:[
    {key:'label',       label:'Label',        type:'text'},
    {key:'color',       label:'Color',        type:'select', options:['red','green','yellow','blue']},
    {key:'commonAnode', label:'Common Anode', type:'select', options:['false','true']},
  ],
  _segs: {
    a:  [[1.6,1.1],[3.6,1.1],[3.85,1.35],[3.6,1.6],[1.6,1.6],[1.35,1.35]],
    b:  [[3.7,1.6],[3.95,1.35],[4.1,2.9],[3.95,3.1],[3.7,3.0],[3.55,1.7]],
    c:  [[3.7,3.4],[3.95,3.15],[4.1,4.5],[3.95,4.75],[3.7,4.65],[3.55,3.5]],
    d:  [[1.6,4.65],[3.6,4.65],[3.85,4.9],[3.6,5.15],[1.6,5.15],[1.35,4.9]],
    e:  [[1.15,3.4],[1.4,3.15],[1.55,3.5],[1.55,4.65],[1.4,4.75],[1.15,4.5]],
    f:  [[1.15,1.6],[1.4,1.35],[1.55,1.7],[1.55,3.0],[1.4,3.1],[1.15,2.9]],
    g:  [[1.6,3.05],[3.6,3.05],[3.85,3.3],[3.6,3.55],[1.6,3.55],[1.35,3.3]],
    dp: [[3.8,4.75],[4.1,4.75],[4.1,5.1],[3.8,5.1]],
  },
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    var bx=x+0.5*g, by=y+1*g, bw=5*g, bh=6*g, sc=g;
    var segs=comp._segState||{};
    var color=LED_COLORS[comp.props.color]||LED_COLORS.red;
    // Body
    ctx.fillStyle='#0a0a0a'; ctx.strokeStyle='#30363d'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,4); ctx.fill(); ctx.stroke();
    // Segments
    var self=SevenSeg;
    Object.keys(self._segs).forEach(function(seg){
      var pts=self._segs[seg], on=segs[seg]||false;
      ctx.beginPath();
      ctx.moveTo(bx+pts[0][0]*sc, by+pts[0][1]*sc);
      for(var i=1;i<pts.length;i++) ctx.lineTo(bx+pts[i][0]*sc, by+pts[i][1]*sc);
      ctx.closePath();
      ctx.fillStyle=on?color:color+'22';
      ctx.strokeStyle=on?color:color+'55';
      ctx.lineWidth=0.5; ctx.fill(); ctx.stroke();
    });
    // Pins
    comp.pins.forEach(function(pin){
      var px=x+pin.gx*g, py=y+pin.gy*g;
      var isTop=(pin.gy===0);
      ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px, isTop?by:by+bh);
      ctx.strokeStyle='#30363d'; ctx.lineWidth=1; ctx.stroke();
      ctx.font='7px "JetBrains Mono",monospace'; ctx.fillStyle='#4a5568'; ctx.textAlign='center';
      ctx.fillText(pin.name, px, isTop?py-3:py+9);
      _pin(ctx, px, py, pin.connected);
    });
    //_label(ctx, comp.props.label||'U', x+3*g, y+7.5*g);
  },
  mnaStamp: function(comp, na, nb, G) {},
  onGPIO: function(comp, bcm, state) {
    var idx=comp.connectedPins?comp.connectedPins.indexOf(bcm):-1;
    if(idx<0) return;
    var segName=SevenSeg._pinToSeg[idx];
    if(!segName) return;
    comp._segState=comp._segState||{};
    var hi=state.value===1;
    var isCA=comp.props.commonAnode==='true'||comp.props.commonAnode===true;
    comp._segState[segName]=isCA?!hi:hi;
  },
};
// ══════════════════════════════════════════════════════════════════════════════
// VCC
// ══════════════════════════════════════════════════════════════════════════════
var VCC = {
  id:'vcc', label:'VCC', width:1, height:2,
  pins:[{name:'+',gx:0,gy:2}],
  defaults:{voltage:3.3},
  props:[{key:'voltage', label:'Voltage (V)', type:'number', min:1, max:5}],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    ctx.beginPath(); ctx.moveTo(x,y+2*g); ctx.lineTo(x,y+g);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-g*0.5,y+g); ctx.lineTo(x+g*0.5,y+g);
    ctx.strokeStyle='#f87171'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.font='10px "JetBrains Mono",monospace';
    ctx.fillStyle='#f87171'; ctx.textAlign='center';
    ctx.fillText('+'+(comp.props.voltage||3.3)+'V', x, y+g-6);
    _pin(ctx,x,y+2*g,comp.pins[0].connected);
  },
  mnaStamp: function(comp, na, nb, G, I, vi) {
    if(vi===undefined||na===0) return;
    G[vi][na-1]+=1; G[na-1][vi]+=1;
    I[vi]=parseFloat(comp.props.voltage)||3.3;
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// GND
// ══════════════════════════════════════════════════════════════════════════════
var GND = {
  id:'gnd', label:'Ground', width:1, height:2,
  pins:[{name:'G',gx:0,gy:0}],
  defaults:{},
  props:[],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+g);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    [g*0.8, g*0.5, g*0.25].forEach(function(w,i){
      ctx.beginPath(); ctx.moveTo(x-w,y+g+i*5); ctx.lineTo(x+w,y+g+i*5);
      ctx.strokeStyle='#8b949e'; ctx.lineWidth=1.5; ctx.stroke();
    });
    _pin(ctx,x,y,comp.pins[0].connected);
  },
  mnaStamp: function() {},
};

// ══════════════════════════════════════════════════════════════════════════════
// GPIO PIN (draggable canvas object)
// ══════════════════════════════════════════════════════════════════════════════
var GPIOPin = {
  id:'gpiopin', label:'GPIO Pin', width:3, height:2,
  pins:[{name:'IO',gx:3,gy:1}],
  defaults:{bcm:17, label:'GPIO17'},
  props:[
    {key:'label', label:'Label',   type:'text'},
    {key:'bcm',   label:'BCM Pin', type:'number', min:2, max:27},
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID, cx=x+1.5*g, cy=y+g;
    var mode=comp._gpioMode||'OUT', val=comp._gpioValue||0, pwm=comp._gpioPWM;
    var color='#4a5568';
    if(mode==='OUT'){ color=(pwm!=null)?'#22d3ee':(val===1?'#4ade80':'#374151'); }
    ctx.fillStyle='#1c2230'; ctx.strokeStyle=color; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(x+2,y+2,2.5*g-4,1.5*g-4,4); ctx.fill(); ctx.stroke();
    ctx.font='bold 10px "JetBrains Mono",monospace';
    ctx.fillStyle=color; ctx.textAlign='center';
    ctx.fillText(comp.props.label||('GPIO'+comp.props.bcm), cx, cy+3);
    var badge='IN';
    if(mode==='OUT') badge=(pwm!=null)?('PWM '+Math.round(pwm)+'%'):(val?'HIGH':'LOW');
    ctx.font='8px "JetBrains Mono",monospace';
    ctx.fillStyle=color+'aa';
    ctx.fillText(badge, cx, cy+g*0.65);
    ctx.beginPath(); ctx.moveTo(x+2.5*g-2,cy); ctx.lineTo(x+3*g,cy);
    ctx.strokeStyle=(mode==='OUT'&&val)?'#4ade80':'#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    _pin(ctx,x+3*g,cy,comp.pins[0].connected);
  },
  mnaStamp: function(comp, na, nb, G, I, vi) {
    var mode=comp._gpioMode||'OUT';
    if(mode!=='OUT'||vi===undefined||na===0) return;
    var pwm=comp._gpioPWM;
    var v=(pwm!=null)?(pwm/100*3.3):(comp._gpioValue===1?3.3:0.0);
    G[vi][na-1]+=1; G[na-1][vi]+=1; I[vi]=v;
  },
  onGPIO: function(comp, bcm, state) {
    comp._gpioMode=state.mode||'OUT';
    comp._gpioValue=state.value||0;
    comp._gpioPWM=(state.pwm!=null)?state.pwm:null;
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
var COMPONENT_REGISTRY = {
  resistor:  Resistor,
  led:       LED,
  capacitor: Capacitor,
  switch:    Switch,
  sevenseg:  SevenSeg,
  vcc:       VCC,
  gnd:       GND,
  gpiopin:   GPIOPin,
};

function createComponent(typeId, x, y) {
  var def = COMPONENT_REGISTRY[typeId];
  if (!def) { console.error('Unknown component:', typeId); return null; }
  var sx = Math.round(x / GRID) * GRID;
  var sy = Math.round(y / GRID) * GRID;
  return {
    id:       typeId + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    type:     typeId,
    def:      def,
    x:        sx,
    y:        sy,
    props:    JSON.parse(JSON.stringify(def.defaults)),
    pins:     def.pins.map(function(p){ return {name:p.name,gx:p.gx,gy:p.gy,connected:false,_node:0,_voltage:0,_driven:false}; }),
    selected: false,
    _lit:     false,
    _brightness: 0,
    _segState:   {},
    _gpioMode:   'OUT',
    _gpioValue:  0,
    _gpioPWM:    null,
    _state:      [0,0,0,0,0,0,0,0],
    _prevCK:     0,
    _ocLow:      true,
    connectedBCM:   null,
    connectedPins:  [],
  };
}

// Export
window.Components = { COMPONENT_REGISTRY: COMPONENT_REGISTRY, createComponent: createComponent, GRID: GRID };

// ══════════════════════════════════════════════════════════════════════════════
// MM74HC374 — 3-STATE Octal D-Type Flip-Flop
// Pinout matches DIP/SOIC datasheet exactly
// Pin 1=OC, 2-9=1D-8D, 10=GND, 11=CK, 12-19=8Q-1Q, 20=VCC
// ══════════════════════════════════════════════════════════════════════════════
var HC374 = {
  id: 'hc374',
  label: 'MM74HC374 Octal D Flip-Flop',
  width: 10,
  height: 14,
  pins: [
    // Left side (pins 1-10), gx=0
    { name: 'OC',  gx: 0,  gy: 1  },  // pin 1  - output control (active low)
    { name: '1D',  gx: 0,  gy: 2  },  // pin 2
    { name: '2D',  gx: 0,  gy: 3  },  // pin 3
    { name: '3D',  gx: 0,  gy: 4  },  // pin 4
    { name: '4D',  gx: 0,  gy: 5  },  // pin 5
    { name: '5D',  gx: 0,  gy: 6  },  // pin 6
    { name: '6D',  gx: 0,  gy: 7  },  // pin 7
    { name: '7D',  gx: 0,  gy: 8  },  // pin 8
    { name: '8D',  gx: 0,  gy: 9  },  // pin 9
    { name: 'GND', gx: 0,  gy: 10 },  // pin 10
    // Right side (pins 11-20), gx=10
    { name: 'CK',  gx: 10, gy: 10 },  // pin 11 - clock
    { name: '8Q',  gx: 10, gy: 9  },  // pin 12
    { name: '7Q',  gx: 10, gy: 8  },  // pin 13
    { name: '6Q',  gx: 10, gy: 7  },  // pin 14
    { name: '5Q',  gx: 10, gy: 6  },  // pin 15
    { name: '4Q',  gx: 10, gy: 5  },  // pin 16
    { name: '3Q',  gx: 10, gy: 4  },  // pin 17
    { name: '2Q',  gx: 10, gy: 3  },  // pin 18
    { name: '1Q',  gx: 10, gy: 2  },  // pin 19
    { name: 'VCC', gx: 10, gy: 1  },  // pin 20
  ],
  defaults: { label: 'U1', _state: [0,0,0,0,0,0,0,0], _prevCK: 0, _ocLow: true },
  props: [
    { key: 'label', label: 'Label', type: 'text' },
  ],


  draw: function(ctx, comp) {
    var x = comp.x, y = comp.y, g = GRID;
    var bx = x + g, by = y + g * 0.5;
    var bw = g * 8, bh = g * 13;

    // IC body
    ctx.fillStyle = '#1a1f2e';
    ctx.strokeStyle = comp.selected ? '#4ade80' : '#4a5568';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 4);
    ctx.fill(); ctx.stroke();

    // Notch (pin 1 indicator)
    ctx.beginPath();
    ctx.arc(bx + bw/2, by, 4, 0, Math.PI, true);
    ctx.fillStyle = '#4a5568';
    ctx.fill();

    // IC label
    ctx.font = 'bold 9px "JetBrains Mono",monospace';
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'center';
    ctx.fillText('74HC374', bx + bw/2, by + g * 1.2);
    ctx.font = '8px "JetBrains Mono",monospace';
    ctx.fillStyle = '#8b949e';
    ctx.fillText(comp.props.label || 'U1', bx + bw/2, by + g * 2.0);
    ctx.fillText('Octal D FF', bx + bw/2, by + g * 2.8);

    // Draw flip-flop state indicators (8 small boxes in the middle)
    var state = comp._state || [0,0,0,0,0,0,0,0];
    var oc = comp._ocLow !== false; // OC active (low = enabled)
    for (var i = 0; i < 8; i++) {
      var boxy = by + g * (3.8 + i * 1.1);
      var boxx = bx + bw/2 - g * 1.5;
      // D input indicator
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(boxx, boxy, g * 1.2, g * 0.7);
      ctx.font = '7px "JetBrains Mono",monospace';
      ctx.fillStyle = '#60a5fa';
      ctx.textAlign = 'center';
      ctx.fillText('D'+(i+1), boxx + g*0.6, boxy + g*0.5);
      // Q output indicator
      var qx = boxx + g * 1.6;
      ctx.fillStyle = state[i] && oc ? '#166534' : '#1a2030';
      ctx.fillRect(qx, boxy, g * 1.2, g * 0.7);
      ctx.fillStyle = state[i] && oc ? '#4ade80' : '#4a5568';
      ctx.fillText('Q'+(i+1)+'='+(state[i]?'1':'0'), qx + g*0.6, boxy + g*0.5);
    }

    // Clock indicator
    var ckV = (comp.pins[10]._voltage || 0) > 1.5;
    ctx.fillStyle = ckV ? '#22d3ee' : '#2d3748';
    ctx.fillRect(bx + bw/2 - g*0.4, by + bh - g*1.5, g*0.8, g*0.8);
    ctx.font = '7px "JetBrains Mono",monospace';
    ctx.fillStyle = ckV ? '#22d3ee' : '#4a5568';
    ctx.fillText('CK', bx + bw/2, by + bh - g*0.6);

    // OC indicator
    var ocV = (comp.pins[0]._voltage || 0) < 1.5; // active LOW
    ctx.font = '7px "JetBrains Mono",monospace';
    ctx.fillStyle = ocV ? '#4ade80' : '#f87171';
    ctx.fillText(ocV ? 'OUT:EN' : 'OUT:HiZ', bx + bw/2, by + g*3.2);

    // Pin labels - left side
    var leftPins = ['OC','1D','2D','3D','4D','5D','6D','7D','8D','GND'];
    leftPins.forEach(function(name, i) {
      var py = y + (i+1)*g;
      // Wire stub
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(bx, py);
      ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1.5; ctx.stroke();
      // Label
      ctx.font = '8px "JetBrains Mono",monospace';
      ctx.fillStyle = name==='GND'?'#8b949e':name==='OC'?'#fbbf24':'#8b949e';
      ctx.textAlign = 'left';
      ctx.fillText(name, bx + 3, py + 3);
      // Pin dot
      ctx.beginPath(); ctx.arc(x, py, 3, 0, Math.PI*2);
      ctx.fillStyle = comp.pins[i].connected ? '#4ade80' : '#30363d';
      ctx.fill();
    });

    // Pin labels - right side
    var rightPins = ['CK','8Q','7Q','6Q','5Q','4Q','3Q','2Q','1Q','VCC'];
    rightPins.forEach(function(name, i) {
      var py = y + (10-i)*g;
      var px = x + 10*g;
      // Wire stub
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx+bw, py);
      ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1.5; ctx.stroke();
      // Label
      ctx.font = '8px "JetBrains Mono",monospace';
      ctx.fillStyle = name==='VCC'?'#f87171':name==='CK'?'#22d3ee':'#8b949e';
      ctx.textAlign = 'right';
      ctx.fillText(name, bx+bw-3, py + 3);
      // Pin dot
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2);
      ctx.fillStyle = comp.pins[10+i].connected ? '#4ade80' : '#30363d';
      ctx.fill();
    });
  },

  mnaStamp: function(comp, na, nb, G, I) {
    // Digital IC - minimal MNA impact
    // VCC and GND pins handled by connections to VCC/GND components
    // Q outputs treated as voltage sources when output is enabled
  },

  // Called every MNA frame to update flip-flop logic
  update: function(comp) {
    // Ensure per-instance state arrays exist (not shared with def object)
    if (!Array.isArray(comp._state)) comp._state = [0,0,0,0,0,0,0,0];
    if (comp._prevCK === undefined) comp._prevCK = 0;
    if (comp._ocLow === undefined) comp._ocLow = true;
    var pins = comp.pins;
    // Read input voltages (threshold: 1.5V for HC logic at 3.3V, 2.0V at 5V)
    var vcc  = pins[19]._voltage || 0;
    var thresh = vcc > 4.0 ? 2.0 : 1.5;

    var oc   = (pins[0]._voltage  || 0) < thresh;   // OC: active LOW
    var ck   = (pins[10]._voltage || 0) > thresh;   // Clock
    var prev = comp._prevCK || 0;

    // Rising edge detection
    var risingEdge = ck && !prev;

    if (risingEdge) {
      // Latch D inputs to Q outputs on rising clock edge
      for (var i = 0; i < 8; i++) {
        var dPin = pins[1 + i]; // 1D-8D are pins 1-8
        comp._state[i] = (dPin._voltage || 0) > thresh ? 1 : 0;
      }
    }

    comp._prevCK = ck ? 1 : 0;
    comp._ocLow  = oc;

    // Drive Q output pins voltage based on state and OC
    // Q pins: 1Q=pin19(idx18), 2Q=pin18(idx17) ... 8Q=pin12(idx11)
    // In the pin array: idx 11=8Q, 12=7Q, 13=6Q, 14=5Q, 15=4Q, 16=3Q, 17=2Q, 18=1Q
    var qMap = [18, 17, 16, 15, 14, 13, 12, 11]; // 1Q..8Q pin indices
    for (var j = 0; j < 8; j++) {
      if (oc) {
        // Output enabled: drive to VCC or GND
        pins[qMap[j]]._voltage = comp._state[j] ? (vcc || 3.3) : 0;
        pins[qMap[j]]._driven  = true;
      } else {
        // High-Z: don't drive
        pins[qMap[j]]._driven  = false;
      }
    }
  },
};

// Register HC374
COMPONENT_REGISTRY['hc374'] = HC374;
window.Components.COMPONENT_REGISTRY = COMPONENT_REGISTRY;

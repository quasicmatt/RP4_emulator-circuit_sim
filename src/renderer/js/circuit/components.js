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


// ══════════════════════════════════════════════════════════════════════════════
// BC547 — NPN BJT Transistor (TO-92: pin1=C, pin2=B, pin3=E)
// Model: Ebers-Moll simplified — beta=200, VBE=0.66V
// ══════════════════════════════════════════════════════════════════════════════
var NPN_BJT = {
  id: 'npn_bjt', label: 'BC547 NPN Transistor', width: 3, height: 4,
  pins: [
    { name: 'C', gx: 2, gy: 0 },  // Collector (top)
    { name: 'B', gx: 0, gy: 2 },  // Base (left)
    { name: 'E', gx: 2, gy: 4 },  // Emitter (bottom)
  ],
  defaults: { label: 'Q', beta: 200, vbe: 0.66, type: 'BC547' },
  props: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'beta',  label: 'hFE (β)', type: 'number', min: 10, max: 1000 },
    { key: 'vbe',   label: 'VBE (V)', type: 'number', min: 0.4, max: 0.9 },
    { key: 'type',  label: 'Type',    type: 'select', options: ['BC547','BC548','BC549'] },
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    var cx=x+1.5*g, cy=y+2*g;
    // Body circle
    ctx.beginPath(); ctx.arc(cx, cy, g*1.1, 0, Math.PI*2);
    ctx.fillStyle='#1a1f2e';
    ctx.strokeStyle=comp.selected?'#4ade80':'#60a5fa';
    ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
    // Base line (horizontal from left)
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(cx-g*0.3,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Vertical bar
    ctx.beginPath(); ctx.moveTo(cx-g*0.3,cy-g*0.7); ctx.lineTo(cx-g*0.3,cy+g*0.7);
    ctx.strokeStyle='#60a5fa'; ctx.lineWidth=2.5; ctx.stroke();
    // Collector line (up-right with arrow feel)
    ctx.beginPath(); ctx.moveTo(cx-g*0.3,cy-g*0.5); ctx.lineTo(cx+g*0.5,cy-g*1.2); ctx.lineTo(x+2*g,y);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Emitter line (down-right with arrow)
    ctx.beginPath(); ctx.moveTo(cx-g*0.3,cy+g*0.5); ctx.lineTo(cx+g*0.5,cy+g*1.2); ctx.lineTo(x+2*g,y+4*g);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Emitter arrow
    var ex1=cx+g*0.2, ey1=cy+g*0.9, ex2=cx+g*0.5, ey2=cy+g*1.2;
    var ang=Math.atan2(ey2-ey1,ex2-ex1);
    ctx.beginPath();
    ctx.moveTo(ex2,ey2);
    ctx.lineTo(ex2-g*0.25*Math.cos(ang-0.5),ey2-g*0.25*Math.sin(ang-0.5));
    ctx.lineTo(ex2-g*0.25*Math.cos(ang+0.5),ey2-g*0.25*Math.sin(ang+0.5));
    ctx.closePath(); ctx.fillStyle='#30363d'; ctx.fill();
    // Pin labels
    ctx.font='8px "JetBrains Mono",monospace'; ctx.fillStyle='#8b949e';
    ctx.textAlign='center';
    ctx.fillText('C',x+2*g+8,y+4); ctx.fillText('B',x-4,cy+3); ctx.fillText('E',x+2*g+8,y+4*g+2);
    _label(ctx,(comp.props.label||'Q'),cx,cy+g*1.6);
    _pin(ctx,x+2*g,y,comp.pins[0].connected);
    _pin(ctx,x,cy,comp.pins[1].connected);
    _pin(ctx,x+2*g,y+4*g,comp.pins[2].connected);
  },
  mnaStamp: function(comp, na, nb, G, I) {
    // na=C(pin0), nb=B(pin1), nc=E(pin2) — but stamp2 only takes 2 nodes
    // Full stamp handled in mnaStampFull
  },
  mnaStampFull: function(comp, G, Iv) {
    var nc = comp.pins[0]._node; // Collector
    var nb = comp.pins[1]._node; // Base
    var ne = comp.pins[2]._node; // Emitter
    var vbe_on = parseFloat(comp.props.vbe) || 0.66;
    var beta   = parseFloat(comp.props.beta) || 200;
    // Read current operating voltages
    var Vb = comp.pins[1]._voltage || 0;
    var Ve = comp.pins[2]._voltage || 0;
    var Vbe = Vb - Ve;
    var conducting = Vbe >= vbe_on * 0.8;
    if (!conducting) {
      // Cut-off: very high impedance — small leakage
      var gleak = 1e-9;
      if (nc>0) G[nc-1][nc-1]+=gleak;
      if (ne>0) G[ne-1][ne-1]+=gleak;
      if (nc>0&&ne>0){G[nc-1][ne-1]-=gleak;G[ne-1][nc-1]-=gleak;}
      return;
    }
    // Active region: Ic = beta * Ib
    // Model BE junction as diode (Shockley), CE as current-controlled current source
    var Is=1e-14, nf=1.0, VT=0.02585;
    var arg=Math.min(Vbe/(nf*VT),50);
    var Ib=Is*(Math.exp(arg)-1);
    var Ic=beta*Ib;
    // Stamp BE diode
    var Gbe=Is/(nf*VT)*Math.exp(arg);
    var Ieq=Ib-Gbe*Vbe;
    if(nb>0){G[nb-1][nb-1]+=Gbe;}
    if(ne>0){G[ne-1][ne-1]+=Gbe;}
    if(nb>0&&ne>0){G[nb-1][ne-1]-=Gbe;G[ne-1][nb-1]-=Gbe;}
    if(nb>0) Iv[nb-1]-=Ieq;
    if(ne>0) Iv[ne-1]+=Ieq;
    // Stamp CE controlled current source: Ic flows from C to E
    var Gce=1.0/20.0; // saturation resistance
    if(nc>0){G[nc-1][nc-1]+=Gce;}
    if(ne>0){G[ne-1][ne-1]+=Gce;}
    if(nc>0&&ne>0){G[nc-1][ne-1]-=Gce;G[ne-1][nc-1]-=Gce;}
    // Current source: beta*Ib from collector to emitter
    if(nc>0) Iv[nc-1]+=Ic;
    if(ne>0) Iv[ne-1]-=Ic;
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// IRFZ34 — N-Channel MOSFET (TO-220: G, D, S)
// Enhancement mode: conducts when VGS > VGS(th) ~2-4V
// ══════════════════════════════════════════════════════════════════════════════
var NMOS = {
  id: 'nmos', label: 'IRFZ34 N-MOSFET', width: 3, height: 4,
  pins: [
    { name: 'D', gx: 2, gy: 0 },  // Drain (top)
    { name: 'G', gx: 0, gy: 2 },  // Gate (left)
    { name: 'S', gx: 2, gy: 4 },  // Source (bottom)
  ],
  defaults: { label: 'M', vth: 3.0, rds_on: 0.05, type: 'IRFZ34' },
  props: [
    { key: 'label',   label: 'Label',      type: 'text' },
    { key: 'vth',     label: 'VGS(th) V',  type: 'number', min: 0.5, max: 6.0 },
    { key: 'rds_on',  label: 'RDS(on) Ω',  type: 'number', min: 0.001, max: 100 },
    { key: 'type',    label: 'Type',        type: 'select', options: ['IRFZ34'] },
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    var cx=x+1.5*g, cy=y+2*g;
    // Body circle
    ctx.beginPath(); ctx.arc(cx,cy,g*1.1,0,Math.PI*2);
    ctx.fillStyle='#1a1f2e';
    ctx.strokeStyle=comp.selected?'#4ade80':'#22d3ee';
    ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
    // Gate line
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(cx-g*0.5,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Gate plate
    ctx.beginPath(); ctx.moveTo(cx-g*0.5,cy-g*0.8); ctx.lineTo(cx-g*0.5,cy+g*0.8);
    ctx.strokeStyle='#22d3ee'; ctx.lineWidth=2.5; ctx.stroke();
    // Channel body (3 lines for N-type)
    var offset=g*0.15;
    for(var i=-1;i<=1;i++){
      ctx.beginPath();
      ctx.moveTo(cx-g*0.2,cy+i*g*0.4-offset); ctx.lineTo(cx+g*0.3,cy+i*g*0.4-offset);
      ctx.strokeStyle='#22d3ee'; ctx.lineWidth=1.5; ctx.stroke();
    }
    // Drain line (top)
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy-g*0.8); ctx.lineTo(cx+g*0.3,cy-g*0.4-offset);
    ctx.moveTo(cx+g*0.3,cy-g*0.8); ctx.lineTo(x+2*g,y);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Source line with arrow (bottom)
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy+g*0.4+offset); ctx.lineTo(cx+g*0.3,cy+g*0.8);
    ctx.moveTo(cx+g*0.3,cy+g*0.8); ctx.lineTo(x+2*g,y+4*g);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Arrow on source (N-type points inward toward channel)
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy+g*0.15);
    ctx.lineTo(cx+g*0.3-g*0.2,cy-g*0.1); ctx.lineTo(cx+g*0.3+g*0.2,cy-g*0.1);
    ctx.closePath(); ctx.fillStyle='#22d3ee'; ctx.fill();
    // N label
    ctx.font='bold 9px "JetBrains Mono",monospace'; ctx.fillStyle='#22d3ee'; ctx.textAlign='center';
    ctx.fillText('N',cx,cy+g*1.55);
    ctx.font='8px "JetBrains Mono",monospace'; ctx.fillStyle='#8b949e';
    ctx.fillText('D',x+2*g+8,y+4); ctx.fillText('G',x-4,cy+3); ctx.fillText('S',x+2*g+8,y+4*g+2);
    _label(ctx,(comp.props.label||'M'),cx-g*0.5,cy+g*1.55);
    _pin(ctx,x+2*g,y,comp.pins[0].connected);
    _pin(ctx,x,cy,comp.pins[1].connected);
    _pin(ctx,x+2*g,y+4*g,comp.pins[2].connected);
  },
  mnaStampFull: function(comp, G, Iv) {
    var nd=comp.pins[0]._node, ng=comp.pins[1]._node, ns=comp.pins[2]._node;
    var Vg=comp.pins[1]._voltage||0, Vs=comp.pins[2]._voltage||0;
    var Vgs=Vg-Vs;
    var Vth=parseFloat(comp.props.vth)||3.0;
    var Rds=parseFloat(comp.props.rds_on)||0.05;
    // Enhancement N-MOSFET: conducts when Vgs > Vth
    var gds = Vgs>Vth ? 1.0/Rds : 1e-9;
    if(nd>0){G[nd-1][nd-1]+=gds;}
    if(ns>0){G[ns-1][ns-1]+=gds;}
    if(nd>0&&ns>0){G[nd-1][ns-1]-=gds;G[ns-1][nd-1]-=gds;}
  },
  mnaStamp: function() {},
};

// ══════════════════════════════════════════════════════════════════════════════
// IRF4905 — P-Channel MOSFET (TO-220: G, D, S)
// Enhancement mode: conducts when VGS < VGS(th) ~(-2 to -4V)
// Note: Source tied to positive rail, Gate pulled LOW to turn on
// ══════════════════════════════════════════════════════════════════════════════
var PMOS = {
  id: 'pmos', label: 'IRF4905 P-MOSFET', width: 3, height: 4,
  pins: [
    { name: 'D', gx: 2, gy: 0 },
    { name: 'G', gx: 0, gy: 2 },
    { name: 'S', gx: 2, gy: 4 },
  ],
  defaults: { label: 'M', vth: -3.0, rds_on: 0.02, type: 'IRF4905' },
  props: [
    { key: 'label',  label: 'Label',      type: 'text' },
    { key: 'vth',    label: 'VGS(th) V',  type: 'number', min: -6.0, max: -0.5 },
    { key: 'rds_on', label: 'RDS(on) Ω',  type: 'number', min: 0.001, max: 100 },
    { key: 'type',   label: 'Type',        type: 'select', options: ['IRF4905'] },
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    var cx=x+1.5*g, cy=y+2*g;
    ctx.beginPath(); ctx.arc(cx,cy,g*1.1,0,Math.PI*2);
    ctx.fillStyle='#1a1f2e';
    ctx.strokeStyle=comp.selected?'#4ade80':'#f87171';
    ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,cy); ctx.lineTo(cx-g*0.5,cy);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx-g*0.5,cy-g*0.8); ctx.lineTo(cx-g*0.5,cy+g*0.8);
    ctx.strokeStyle='#f87171'; ctx.lineWidth=2.5; ctx.stroke();
    var offset=g*0.15;
    for(var i=-1;i<=1;i++){
      ctx.beginPath();
      ctx.moveTo(cx-g*0.2,cy+i*g*0.4-offset); ctx.lineTo(cx+g*0.3,cy+i*g*0.4-offset);
      ctx.strokeStyle='#f87171'; ctx.lineWidth=1.5; ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy-g*0.8); ctx.lineTo(cx+g*0.3,cy-g*0.4-offset);
    ctx.moveTo(cx+g*0.3,cy-g*0.8); ctx.lineTo(x+2*g,y);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy+g*0.4+offset); ctx.lineTo(cx+g*0.3,cy+g*0.8);
    ctx.moveTo(cx+g*0.3,cy+g*0.8); ctx.lineTo(x+2*g,y+4*g);
    ctx.strokeStyle='#30363d'; ctx.lineWidth=1.5; ctx.stroke();
    // Arrow points outward (P-type)
    ctx.beginPath(); ctx.moveTo(cx+g*0.3,cy-g*0.15);
    ctx.lineTo(cx+g*0.3-g*0.2,cy+g*0.1); ctx.lineTo(cx+g*0.3+g*0.2,cy+g*0.1);
    ctx.closePath(); ctx.fillStyle='#f87171'; ctx.fill();
    ctx.font='bold 9px "JetBrains Mono",monospace'; ctx.fillStyle='#f87171'; ctx.textAlign='center';
    ctx.fillText('P',cx,cy+g*1.55);
    ctx.font='8px "JetBrains Mono",monospace'; ctx.fillStyle='#8b949e';
    ctx.fillText('D',x+2*g+8,y+4); ctx.fillText('G',x-4,cy+3); ctx.fillText('S',x+2*g+8,y+4*g+2);
    _label(ctx,(comp.props.label||'M'),cx-g*0.5,cy+g*1.55);
    _pin(ctx,x+2*g,y,comp.pins[0].connected);
    _pin(ctx,x,cy,comp.pins[1].connected);
    _pin(ctx,x+2*g,y+4*g,comp.pins[2].connected);
  },
  mnaStampFull: function(comp, G, Iv) {
    var nd=comp.pins[0]._node, ng=comp.pins[1]._node, ns=comp.pins[2]._node;
    var Vg=comp.pins[1]._voltage||0, Vs=comp.pins[2]._voltage||0;
    var Vgs=Vg-Vs;
    var Vth=parseFloat(comp.props.vth)||-3.0;
    var Rds=parseFloat(comp.props.rds_on)||0.02;
    // P-MOSFET conducts when Vgs < Vth (both negative)
    var gds = Vgs<Vth ? 1.0/Rds : 1e-9;
    if(nd>0){G[nd-1][nd-1]+=gds;}
    if(ns>0){G[ns-1][ns-1]+=gds;}
    if(nd>0&&ns>0){G[nd-1][ns-1]-=gds;G[ns-1][nd-1]-=gds;}
  },
  mnaStamp: function() {},
};

// ══════════════════════════════════════════════════════════════════════════════
// LM741 — Operational Amplifier (8-pin DIP)
// Pins: 1=OffNull, 2=Inv(-), 3=NonInv(+), 4=V-, 5=OffNull, 6=Out, 7=V+, 8=NC
// Model: ideal op-amp with finite open-loop gain (200 V/mV = 200000)
// ══════════════════════════════════════════════════════════════════════════════
var OpAmp741 = {
  id: 'opamp741', label: 'LM741 Op-Amp', width: 8, height: 8,
  pins: [
    { name: 'ON1', gx: 0, gy: 1 },  // pin1 Offset Null
    { name: 'IN-', gx: 0, gy: 3 },  // pin2 Inverting input
    { name: 'IN+', gx: 0, gy: 5 },  // pin3 Non-inverting input
    { name: 'V-',  gx: 0, gy: 7 },  // pin4 Negative supply
    { name: 'ON2', gx: 8, gy: 7 },  // pin5 Offset Null
    { name: 'OUT', gx: 8, gy: 5 },  // pin6 Output
    { name: 'V+',  gx: 8, gy: 3 },  // pin7 Positive supply
    { name: 'NC',  gx: 8, gy: 1 },  // pin8 No connect
  ],
  defaults: { label: 'U', gain: 200000 },
  props: [
    { key: 'label', label: 'Label',          type: 'text' },
    { key: 'gain',  label: 'Open-loop gain', type: 'number', min: 1000, max: 1000000 },
  ],
  draw: function(ctx, comp) {
    var x=comp.x, y=comp.y, g=GRID;
    var bx=x+g, by=y+g, bw=g*6, bh=g*6;
    // Body triangle (op-amp symbol)
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx, by+bh);
    ctx.lineTo(bx+bw, by+bh/2); ctx.closePath();
    ctx.fillStyle='#1a1f2e';
    ctx.strokeStyle=comp.selected?'#4ade80':'#fbbf24';
    ctx.lineWidth=1.5; ctx.fill(); ctx.stroke();
    // Labels inside triangle
    ctx.font='bold 11px "JetBrains Mono",monospace';
    ctx.fillStyle='#fbbf24'; ctx.textAlign='center';
    ctx.fillText('−', bx+g*0.9, by+g*2.2);
    ctx.fillText('+', bx+g*0.9, by+g*4.2);
    ctx.font='8px "JetBrains Mono",monospace';
    ctx.fillStyle='#8b949e';
    ctx.fillText('LM741', bx+bw*0.42, by+bh/2+3);
    ctx.fillText(comp.props.label||'U', bx+bw*0.42, by+bh/2+13);
    // Pin wires
    var pins_left  = [{name:'ON1',gy:1},{name:'IN-',gy:3},{name:'IN+',gy:5},{name:'V-',gy:7}];
    var pins_right = [{name:'ON2',gy:7},{name:'OUT',gy:5},{name:'V+', gy:3},{name:'NC', gy:1}];
    pins_left.forEach(function(p,i){
      var py=y+p.gy*g;
      ctx.beginPath(); ctx.moveTo(x,py); ctx.lineTo(bx,py);
      ctx.strokeStyle='#30363d'; ctx.lineWidth=1; ctx.stroke();
      ctx.font='7px "JetBrains Mono",monospace'; ctx.fillStyle='#4a5568'; ctx.textAlign='left';
      ctx.fillText(p.name, bx+2, py+3);
      _pin(ctx,x,py,comp.pins[i].connected);
    });
    pins_right.forEach(function(p,i){
      var py=y+p.gy*g;
      ctx.beginPath(); ctx.moveTo(x+8*g,py); ctx.lineTo(bx+bw,py);
      ctx.strokeStyle='#30363d'; ctx.lineWidth=1; ctx.stroke();
      ctx.font='7px "JetBrains Mono",monospace'; ctx.fillStyle=(p.name==='OUT')?'#4ade80':'#4a5568';
      ctx.textAlign='right';
      ctx.fillText(p.name, bx+bw-2, py+3);
      _pin(ctx,x+8*g,py,comp.pins[4+i].connected);
    });
  },
  mnaStampFull: function(comp, G, Iv) {
    // Ideal op-amp model: Vout = A*(V+ - V-)
    // Implemented as: VCVS (voltage-controlled voltage source)
    // V_out = gain * (V_inp - V_inn)
    // This is handled as a controlled source stamp
    var nInv  = comp.pins[1]._node; // IN- (pin2)
    var nNon  = comp.pins[2]._node; // IN+ (pin3)
    var nVneg = comp.pins[3]._node; // V-  (pin4)
    var nOut  = comp.pins[5]._node; // OUT (pin6)
    var nVpos = comp.pins[6]._node; // V+  (pin7)

    var Vp = comp.pins[2]._voltage || 0;
    var Vm = comp.pins[1]._voltage || 0;
    var Vcc = comp.pins[6]._voltage || 15;
    var Vee = comp.pins[3]._voltage || -15;
    var A = parseFloat(comp.props.gain) || 200000;

    // Compute ideal output, clamp to supply rails
    var Vout_ideal = A * (Vp - Vm);
    var Vout = Math.max(Vee + 0.1, Math.min(Vcc - 0.1, Vout_ideal));

    // Stamp output as a voltage source relative to V-
    // Output drives Vout with low impedance (Rout = 75 ohm typical)
    var Rout = 75;
    if (nOut > 0) {
      var gout = 1.0 / Rout;
      G[nOut-1][nOut-1] += gout;
      // Drive toward Vout
      Iv[nOut-1] += gout * Vout;
      // Return through V-
      if (nVneg > 0) {
        G[nVneg-1][nVneg-1] += gout;
        G[nOut-1][nVneg-1]  -= gout;
        G[nVneg-1][nOut-1]  -= gout;
        Iv[nVneg-1] -= gout * Vout;
      }
    }
    // High input impedance on inputs (1MΩ to GND)
    var gin = 1.0 / 1e6;
    if (nNon > 0) G[nNon-1][nNon-1] += gin;
    if (nInv > 0) G[nInv-1][nInv-1] += gin;
  },
  mnaStamp: function() {},
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

    // Rising edge detection — also check _forcedEdge set by flushPending
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

// ══════════════════════════════════════════════════════════════════════════════
// 4x4 MATRIX KEYPAD
// Pins: X1-X4 (rows, top→bottom), Y1-Y4 (cols, left→right)
// When a key is pressed, its row pin connects to its col pin.
// Layout:
//   X1: 1  2  3  A
//   X2: 4  5  6  B
//   X3: 7  8  9  C
//   X4: *  0  #  D
// Pin positions: X pins on left side, Y pins on top
// ══════════════════════════════════════════════════════════════════════════════
var Keypad4x4 = {
  id: 'keypad4x4',
  label: '4x4 Matrix Keypad',
  width: 10,
  height: 12,
  pins: [
    // X pins (rows) on left side, evenly spaced down
    { name: 'X1', gx: 0, gy: 3  },
    { name: 'X2', gx: 0, gy: 5  },
    { name: 'X3', gx: 0, gy: 7  },
    { name: 'X4', gx: 0, gy: 9  },
    // Y pins (cols) on right side, evenly spaced down
    { name: 'Y1', gx: 10, gy: 3  },
    { name: 'Y2', gx: 10, gy: 5  },
    { name: 'Y3', gx: 10, gy: 7  },
    { name: 'Y4', gx: 10, gy: 9  },
  ],
  // Button labels [row][col]
  _keys: [
    ['1','2','3','A'],
    ['4','5','6','B'],
    ['7','8','9','C'],
    ['*','0','#','D'],
  ],
  // Which key is currently pressed: {row, col} or null
  _pressed: null,

  defaults: { label: 'KP1' },
  props: [
    { key: 'label', label: 'Label', type: 'text' },
  ],

  draw: function(ctx, comp) {
    var x = comp.x, y = comp.y, g = GRID;
    var self = Keypad4x4;

    // Body
    var bx = x + g, by = y + g;
    var bw = g * 8, bh = g * 10;
    ctx.fillStyle = '#1a1f2e';
    ctx.strokeStyle = comp.selected ? '#4ade80' : '#4a5568';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6);
    ctx.fill(); ctx.stroke();

    // Title
    ctx.font = 'bold 9px "JetBrains Mono",monospace';
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'center';
    ctx.fillText('4x4 KEYPAD', bx + bw/2, by + g * 0.75);
    ctx.font = '8px "JetBrains Mono",monospace';
    ctx.fillText(comp.props.label || 'KP1', bx + bw/2, by + g * 1.3);

    // Grid of buttons
    var gridX = bx + g * 0.6;
    var gridY = by + g * 1.8;
    var cellW = (bw - g * 1.2) / 4;
    var cellH = (bh - g * 2.2) / 4;
    var pressed = comp._pressed;

    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 4; col++) {
        var btnX = gridX + col * cellW;
        var btnY = gridY + row * cellH;
        var bw2  = cellW - g * 0.25;
        var bh2  = cellH - g * 0.25;
        var key  = self._keys[row][col];
        var isPressed = pressed && pressed.row === row && pressed.col === col;

        // Button background
        ctx.fillStyle = isPressed ? '#166534' : '#2d3748';
        ctx.strokeStyle = isPressed ? '#4ade80' : '#4a5568';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, bw2, bh2, 3);
        ctx.fill(); ctx.stroke();

        // Key label
        ctx.font = 'bold 10px "JetBrains Mono",monospace';
        ctx.fillStyle = isPressed ? '#4ade80' : '#e6edf3';
        ctx.textAlign = 'center';
        ctx.fillText(key, btnX + bw2/2, btnY + bh2/2 + 4);
      }
    }

    // Pin wires and labels — X pins (left)
    var xPinGYs = [3, 5, 7, 9];
    for (var i = 0; i < 4; i++) {
      var py = y + xPinGYs[i] * g;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(bx, py);
      ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '8px "JetBrains Mono",monospace';
      ctx.fillStyle = '#60a5fa'; ctx.textAlign = 'left';
      ctx.fillText('X' + (i+1), bx + 3, py + 3);
      _pin(ctx, x, py, comp.pins[i].connected);
    }

    // Y pins (right)
    for (var j = 0; j < 4; j++) {
      var py2 = y + xPinGYs[j] * g;
      var px2 = x + 10 * g;
      ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(bx + bw, py2);
      ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = '8px "JetBrains Mono",monospace';
      ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'right';
      ctx.fillText('Y' + (j+1), bx + bw - 3, py2 + 3);
      _pin(ctx, px2, py2, comp.pins[4 + j].connected);
    }
  },

  // MNA: when a key is pressed, its X and Y pins are shorted together
  mnaStamp: function(comp, na, nb, G) { /* handled per-key below */ },

  // Called by canvas MNA loop — stamps active key connection
  update: function(comp) {
    // _pressed is set by canvas mouse handler (onDblClick or click)
    // The actual MNA stamping happens in mnaStampKeypad below
  },

  // Called by MNA solver — stamp the pressed key as a near-short between X and Y
  mnaStampFull: function(comp, G) {
    if (!comp._pressed) return;
    var row = comp._pressed.row;
    var col = comp._pressed.col;
    var xPin = comp.pins[row];       // X1-X4
    var yPin = comp.pins[4 + col];   // Y1-Y4
    var na = xPin._node || 0;
    var nb = yPin._node || 0;
    if (na === nb || na === 0 && nb === 0) return;
    // Short the two pins with a very small resistance (10Ω — realistic contact resistance)
    var g = 1 / 10.0;
    if (na > 0) G[na-1][na-1] += g;
    if (nb > 0) G[nb-1][nb-1] += g;
    if (na > 0 && nb > 0) { G[na-1][nb-1] -= g; G[nb-1][na-1] -= g; }
  },

  // Toggle a key press — called by canvas on click inside keypad body
  pressKey: function(comp, row, col) {
    var releasing = comp._pressed && comp._pressed.row === row && comp._pressed.col === col;
    comp._pressed = releasing ? null : { row: row, col: col };

    // No GPIO injection needed — the MNA handles the keypad electrically.
    // When a key is pressed, its X and Y pins are shorted (10Ω) in the MNA,
    // so Python code scanning the rows/cols sees the correct voltage naturally.
  },
};

// Register
COMPONENT_REGISTRY['keypad4x4'] = Keypad4x4;
window.Components.COMPONENT_REGISTRY = COMPONENT_REGISTRY;

// Register new components
COMPONENT_REGISTRY['npn_bjt']   = NPN_BJT;
COMPONENT_REGISTRY['nmos']      = NMOS;
COMPONENT_REGISTRY['pmos']      = PMOS;
COMPONENT_REGISTRY['opamp741']  = OpAmp741;
window.Components.COMPONENT_REGISTRY = COMPONENT_REGISTRY;

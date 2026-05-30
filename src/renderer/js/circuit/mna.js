/**
 * mna.js — Modified Nodal Analysis with Shockley diode model
 *
 * LED uses full Shockley equation: I = Is*(exp(V/(n*Vt)) - 1)
 * Solved via Newton-Raphson linearization each frame (like SPICE).
 * Parameters per LED color match real device datasheets.
 *
 * Multiple voltage sources on same node: highest voltage wins.
 */

function MNASolver() {}

// Thermal voltage at room temperature (300K)
var VT = 0.02585;

// LED parameters per color: { Is (A), n (emission coeff) }
// Is calculated so Vf is reached at If=20mA
var LED_PARAMS = {
  red:    { Is: 4.303e-21, n: 1.8 }, // Vf~2.0V
  green:  { Is: 4.303e-28, n: 2.0 }, // Vf~2.2V (modern high-eff)
  yellow: { Is: 4.303e-23, n: 1.9 }, // Vf~2.1V
  blue:   { Is: 4.303e-40, n: 2.5 }, // Vf~3.3V
  white:  { Is: 4.303e-40, n: 2.5 }, // Vf~3.2V (blue pump)
};

MNASolver.prototype.solve = function(components, wires) {

  // ── Step 1: Union-Find ────────────────────────────────────────────────────
  var parent = {};
  function find(x) {
    if (parent[x] === undefined) parent[x] = x;
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a, b) {
    a = find(a); b = find(b);
    if (a === b) return;
    if (b === 'GND')      { parent[a] = 'GND'; }
    else if (a === 'GND') { parent[b] = 'GND'; }
    else                  { parent[b] = a; }
  }

  components.forEach(function(c) {
    c.pins.forEach(function(p, i) { find(c.id + ':' + i); });
  });
  components.forEach(function(c) {
    if (c.type === 'gnd') {
      c.pins.forEach(function(p, i) { union(c.id + ':' + i, 'GND'); });
    }
  });
  wires.forEach(function(w) {
    union(w.from.compId + ':' + w.from.pinIdx,
          w.to.compId   + ':' + w.to.pinIdx);
  });

  // ── Step 2: Node indices ──────────────────────────────────────────────────
  var nodeMap = { 'GND': 0 };
  var nextNode = 1;
  function nodeOf(compId, pinIdx) {
    var root = find(compId + ':' + pinIdx);
    if (nodeMap[root] === undefined) nodeMap[root] = nextNode++;
    return nodeMap[root];
  }
  components.forEach(function(c) {
    c.pins.forEach(function(p, i) { p._node = nodeOf(c.id, i); });
  });
  var N = nextNode - 1;

  // ── Step 3: Voltage sources (highest voltage wins per node) ───────────────
  var vsourceMap = {};
  // Collect driven digital IC output pins as voltage sources
  // These override other sources since an IC actively drives the line
  components.forEach(function(c) {
    if (!c.def || typeof c.def.update !== 'function') return;
    c.pins.forEach(function(p) {
      if (p._driven && p._node > 0) {
        // Driven pins always win - store with a flag
        vsourceMap[p._node] = { voltage: p._voltage || 0, forced: true };
      }
    });
  });

  components.forEach(function(c) {
    var posNode, v;
    if (c.type === 'vcc') {
      posNode = c.pins[0]._node;
      v = parseFloat(c.props.voltage) || 3.3;
    } else if (c.type === 'gpiopin' && (c._gpioMode || 'OUT') === 'OUT') {
      posNode = c.pins[0]._node;
      var pwm = c._gpioPWM;
      v = (pwm != null) ? (pwm / 100 * 3.3) : (c._gpioValue === 1 ? 3.3 : 0.0);
    } else {
      return;
    }
    // Only set if not already forced by a driven IC pin
    var existing = vsourceMap[posNode];
    if (!existing || (!existing.forced && v > (existing.voltage !== undefined ? existing.voltage : existing))) {
      vsourceMap[posNode] = v;
    }
  });
  var vsources = [];
  Object.keys(vsourceMap).forEach(function(node) {
    var entry = vsourceMap[node];
    var voltage = (entry !== null && typeof entry === 'object') ? entry.voltage : entry;
    vsources.push({ posNode: parseInt(node), negNode: 0, voltage: voltage });
  });
  var V = vsources.length;
  var M = N + V;
  if (M === 0) return;

  // ── Step 4: Newton-Raphson solve ──────────────────────────────────────────
  // Run up to 50 iterations until convergence
  var MAX_ITER = 50;
  var TOL = 1e-6;

  for (var iter = 0; iter < MAX_ITER; iter++) {

    // Build fresh G and Iv each iteration
    var G = [];
    var Iv = [];
    for (var i = 0; i < M; i++) {
      G.push(new Array(M).fill(0));
      Iv.push(0);
    }

    function stamp2(na, nb, gval) {
      if (na > 0) G[na-1][na-1] += gval;
      if (nb > 0) G[nb-1][nb-1] += gval;
      if (na > 0 && nb > 0) { G[na-1][nb-1] -= gval; G[nb-1][na-1] -= gval; }
    }
    function stampI(na, nb, ival) {
      // current source: ival flows INTO na, OUT of nb
      if (na > 0) Iv[na-1] += ival;
      if (nb > 0) Iv[nb-1] -= ival;
    }

    // Stamp passive components
    components.forEach(function(c) {
      var na = c.pins[0] ? c.pins[0]._node : 0;
      var nb = c.pins[1] ? c.pins[1]._node : 0;

      switch (c.type) {
        case 'resistor': {
          var R = Math.max(parseFloat(c.props.resistance) || 1000, 0.001);
          stamp2(na, nb, 1.0 / R);
          break;
        }

        case 'led': {
          if (na === nb) break;
          // Shockley model, linearized at current operating point
          var color  = c.props.color || 'red';
          var params = LED_PARAMS[color] || LED_PARAMS.red;
          var Is_led = params.Is;
          var n_led  = params.n;

          // Current operating voltage across LED
          var Va = c.pins[0]._voltage || 0;
          var Vb = c.pins[1]._voltage || 0;
          var Vd = Va - Vb;

          // Clamp to prevent exp overflow
          var arg = Math.min(Vd / (n_led * VT), 50);

          // Shockley current and conductance at this operating point
          var Id  = Is_led * (Math.exp(arg) - 1);
          var Gd  = Is_led / (n_led * VT) * Math.exp(arg);

          // Newton-Raphson companion: Geq=Gd, Ieq=Id-Gd*Vd (current source)
          var Ieq = Id - Gd * Vd;

          stamp2(na, nb, Gd);
          // Companion current source: Ieq flows from na to nb (out of anode)
          // This correctly represents the diode offset current
          if (na > 0) Iv[na-1] -= Ieq;
          if (nb > 0) Iv[nb-1] += Ieq;
          break;
        }

        case 'switch': {
          var closed = c.props.closed === true || c.props.closed === 'true';
          if (closed) stamp2(na, nb, 1.0 / 0.001);
          break;
        }

        case 'capacitor':
          break; // DC open circuit
      }
    });

    // Stamp voltage sources
    vsources.forEach(function(vs, k) {
      var row = N + k;
      if (vs.posNode > 0) { G[vs.posNode-1][row] += 1; G[row][vs.posNode-1] += 1; }
      if (vs.negNode > 0) { G[vs.negNode-1][row] -= 1; G[row][vs.negNode-1] -= 1; }
      Iv[row] = vs.voltage;
    });

    // Solve
    var X = gaussElim(G, Iv, M);
    if (!X) break;

    // Check convergence and update pin voltages
    var maxDelta = 0;
    components.forEach(function(c) {
      c.pins.forEach(function(p) {
        var newV = p._node === 0 ? 0 : (isFinite(X[p._node-1]) ? X[p._node-1] : 0);
        maxDelta = Math.max(maxDelta, Math.abs(newV - (p._voltage || 0)));
        p._voltage = newV;
      });
    });

    if (maxDelta < TOL) break; // converged
  }

  // ── Debug output (toggle with window._mnaDEBUG = true) ───────────────────
  if (window._mnaDEBUG) {
    console.group('[MNA] N='+N+' V='+V+' M='+M);
    components.forEach(function(c) {
      c.pins.forEach(function(p,i) {
        console.log('  '+c.type+'('+c.id.slice(-4)+') pin'+i+' -> node'+p._node+' = '+p._voltage.toFixed(4)+'V');
      });
    });
    vsources.forEach(function(vs,i) {
      console.log('  vsrc'+i+': node'+vs.posNode+'->node'+vs.negNode+' = '+vs.voltage+'V');
    });
    console.groupEnd();
  }

};

function gaussElim(A, b, n) {
  var M = [];
  for (var i = 0; i < n; i++) { var row = A[i].slice(); row.push(b[i]); M.push(row); }
  for (var col = 0; col < n; col++) {
    var maxRow = col, maxVal = Math.abs(M[col][col]);
    for (var row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) { maxVal = Math.abs(M[row][col]); maxRow = row; }
    }
    if (maxVal < 1e-14) continue;
    var tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
    for (var r = col + 1; r < n; r++) {
      if (Math.abs(M[col][col]) < 1e-14) continue;
      var f = M[r][col] / M[col][col];
      for (var k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  var X = new Array(n).fill(0);
  for (var i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-14) { X[i] = 0; continue; }
    X[i] = M[i][n];
    for (var j = i + 1; j < n; j++) X[i] -= M[i][j] * X[j];
    X[i] /= M[i][i];
  }
  return X;
}

window.MNA = new MNASolver();

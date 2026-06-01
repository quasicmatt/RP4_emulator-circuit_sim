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
          
          // 1. Fetch properties and fall back to your LED_PARAMS table
          var color = (c.props && c.props.color) ? c.props.color.toLowerCase() : 'red';
          var p = LED_PARAMS[color] || LED_PARAMS.red;
          var nVt = p.n * VT;
          
          // 2. Allow custom Vf override, otherwise calculate from params
          var Vf_l = parseFloat(c.props.vf);
          // If custom Vf exists, calculate the specific saturation current (Is) to reach 20mA at Vf
          var Is = isNaN(Vf_l) ? p.Is : (0.02 / Math.exp(Vf_l / nVt));
          
          var Vd_l = (c.pins[0]._voltage || 0) - (c.pins[1]._voltage || 0);
          
          // 3. Clamp voltage to prevent Newton-Raphson exponential overflow
          // This safely caps the math around the 100mA forward current mark
          var max_Vd = nVt * Math.log(0.1 / Is); 
          if (Vd_l > max_Vd) Vd_l = max_Vd;
          if (Vd_l < -5) Vd_l = -5; // Clamp reverse voltage breakdown
          
          // 4. Shockley Diode Equation
          var exp_term = Math.exp(Vd_l / nVt);
          var Id = Is * (exp_term - 1);
          
          // Linearized conductance (Gd = dId / dVd)
          var Gd = (Is / nVt) * exp_term;
          
          // Add 1 nano-mho to prevent singular matrix errors when the node is floating
          Gd += 1e-9;
          
          // Norton equivalent current source for the passive model
          var Ieq = Id - Gd * Vd_l;
          
          // 5. Stamp the matrix
          stamp2(na, nb, Gd);
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
        case 'keypad4x4': {
          if (!c._pressed) break;
          var xp = c.pins[c._pressed.row];
          var yp = c.pins[4 + c._pressed.col];
          var nkx = xp ? xp._node : 0;
          var nky = yp ? yp._node : 0;
          if (nkx === nky) break;
          if (nkx === 0 && nky === 0) break;
          var gk = 1.0 / 10.0;
          if (nkx > 0) G[nkx-1][nkx-1] += gk;
          if (nky > 0) G[nky-1][nky-1] += gk;
          if (nkx > 0 && nky > 0) { G[nkx-1][nky-1] -= gk; G[nky-1][nkx-1] -= gk; }
          break;
        }

        case 'npn_bjt': {
          // BC547 NPN BJT — emitter follower model
          // pins: 0=C(collector), 1=B(base), 2=E(emitter)
          //
          // Physics: Ve = Vb - Vbe (emitter follows base minus ~0.66V)
          //
          // MNA stamp (ON state):
          //   Drive emitter to (Vb_prev - Vf) using Norton current source.
          //   Vb_prev is the base voltage from the previous iteration.
          //   This converges correctly because the NR loop runs 50 times.
          //   Collector-Emitter: low resistance path (current flows C→E).
          var nc_bjt = c.pins[0]._node;
          var nb_bjt = c.pins[1]._node;
          var ne_bjt = c.pins[2]._node;
          var Vb_bjt = c.pins[1]._voltage || 0;
          var Ve_bjt = c.pins[2]._voltage || 0;
          var Vf_bjt = parseFloat(c.props.vbe) || 0.66;

          // 100Mohm bleed on all pins to prevent floating
          var g_bleed = 1.0 / 100e6;
          if (nc_bjt > 0) G[nc_bjt-1][nc_bjt-1] += g_bleed;
          if (nb_bjt > 0) G[nb_bjt-1][nb_bjt-1] += g_bleed;
          if (ne_bjt > 0) G[ne_bjt-1][ne_bjt-1] += g_bleed;

          var bjt_on = c.pins[1].connected && ((Vb_bjt - Ve_bjt) >= Vf_bjt * 0.8);
          if (!bjt_on) break;

          // ── ON: emitter follower ─────────────────────────────────────────
          // Target emitter voltage from previous frame's base voltage
          var Ve_target = Vb_bjt - Vf_bjt;

          // Drive emitter to Ve_target with strong Norton source
          // Geq large → emitter tightly controlled to Ve_target
          // NR iterations converge Vb → correct value each frame
          var Geq_e = 1.0 / 0.1; // 10 S — strong drive
          if (ne_bjt > 0) {
            G[ne_bjt-1][ne_bjt-1] += Geq_e;
            Iv[ne_bjt-1] += Geq_e * Ve_target; // drive toward target
          }

          // Collector-Emitter: low resistance (BJT conducting)
          // 0.2 ohm models Vce_sat realistically
          var g_ce = 1.0 / 0.2;
          if (nc_bjt > 0) G[nc_bjt-1][nc_bjt-1] += g_ce;
          if (ne_bjt > 0) G[ne_bjt-1][ne_bjt-1] += g_ce;
          if (nc_bjt > 0 && ne_bjt > 0) {
            G[nc_bjt-1][ne_bjt-1] -= g_ce;
            G[ne_bjt-1][nc_bjt-1] -= g_ce;
          }
          break;
        }

        case 'nmos': {
          var nd = c.pins[0]._node;
          var ng = c.pins[1]._node;
          var ns = c.pins[2]._node;

          var Vth = parseFloat(c.props.vth) || 3.0;
          var Ron = parseFloat(c.props.rds_on) || 0.05;
          
          // 1. FIX Kp: Calculate true transconductance so it matches the requested Ron 
          // Rds_on = 1 / (Kp * (Vgs - Vth)). Assuming a standard 5V logic drive for full saturation.
          var driveVoltage = Math.max(1.0, 5.0 - Vth); 
          var Kp = 1.0 / (Ron * driveVoltage);

          var Vd = c.pins[0]._voltage || 0;
          var Vg = c.pins[1]._voltage || 0;
          var Vs = c.pins[2]._voltage || 0;

          var Vgs = Vg - Vs;
          var Vds = Vd - Vs;

          // 2. FIX FLOATING GATE: Add a 1GΩ pull-down to Ground to prevent NaN solver explosions
          if (ng > 0) G[ng-1][ng-1] += 1e-9;

          if (Vgs < Vth) {
            // Cutoff: add tiny conductance
            stamp2(nd, ns, 1e-9);
          } else {
            if (Vds < Vgs - Vth) {
              // Linear (Triode)
              var gm = Kp * Vds;
              var gds = Kp * (Vgs - Vth - Vds);
              var Ids = Kp * ((Vgs - Vth) * Vds - 0.5 * Vds * Vds);
              var Ieq = Ids - gm * Vgs - gds * Vds;
              
              stamp2(nd, ns, gds);
              
              // 3. FIX MATRIX INDEXING: Safely stamp gm (VCCS) preventing G[...][-1] array corruption
              if (nd > 0) {
                if (ng > 0) G[nd-1][ng-1] += gm;
                if (ns > 0) G[nd-1][ns-1] -= gm;
              }
              if (ns > 0) {
                if (ng > 0) G[ns-1][ng-1] -= gm;
                if (ns > 0) G[ns-1][ns-1] += gm;
              }

              // Constant current part
              if (nd > 0) Iv[nd-1] -= Ieq;
              if (ns > 0) Iv[ns-1] += Ieq;

            } else {
              // Saturation
              var Vov = Vgs - Vth;
              var gm = Kp * Vov;
              var gds = 1e-5; // Early effect conductance
              var Ids = 0.5 * Kp * Vov * Vov;
              var Ieq = Ids - gm * Vgs - gds * Vds;

              stamp2(nd, ns, gds);
              
              // Safe gm VCCS
              if (nd > 0) {
                if (ng > 0) G[nd-1][ng-1] += gm;
                if (ns > 0) G[nd-1][ns-1] -= gm;
              }
              if (ns > 0) {
                if (ng > 0) G[ns-1][ng-1] -= gm;
                if (ns > 0) G[ns-1][ns-1] += gm;
              }

              if (nd > 0) Iv[nd-1] -= Ieq;
              if (ns > 0) Iv[ns-1] += Ieq;
            }
          }
          break;
        }

        case 'pmos': {
          var Vth = Math.abs(parseFloat(c.props.vth)) || 3.0; 
          var Ron = parseFloat(c.props.rds_on) || 0.05;
          
          // Calculate transconductance
          var driveVoltage = Math.max(1.0, 5.0 - Vth); 
          var Kp = 1.0 / (Ron * driveVoltage);

          // Get pin voltages
          var Vd_pin = c.pins[0]._voltage || 0;
          var Vg = c.pins[1]._voltage || 0;
          var Vs_pin = c.pins[2]._voltage || 0;

          // FIX THE CRASH: Dynamic Source/Drain Swapping
          // If the PMOS is wired upside-down, or if the solver overshoots during a toggle, Vd can 
          // exceed Vs. We simply swap their roles to keep Vsd positive and the solver stable!
          var isReversed = Vd_pin > Vs_pin;
          var Vs = isReversed ? Vd_pin : Vs_pin;
          var Vd = isReversed ? Vs_pin : Vd_pin;
          var ns = isReversed ? c.pins[0]._node : c.pins[2]._node;
          var nd = isReversed ? c.pins[2]._node : c.pins[0]._node;
          var ng = c.pins[1]._node;

          var Vsg = Vs - Vg;
          var Vsd = Vs - Vd;

          // Floating gate protection (prevents NaN when gate is completely disconnected)
          if (ng > 0) G[ng-1][ng-1] += 1e-9;

          if (Vsg < Vth) {
            // Cutoff
            stamp2(nd, ns, 1e-9);
          } else {
            if (Vsd < Vsg - Vth) {
              // Linear (Triode)
              var gm = Kp * Vsd;
              var gds = Kp * (Vsg - Vth - Vsd);
              var Isd = Kp * ((Vsg - Vth) * Vsd - 0.5 * Vsd * Vsd);
              var Ieq = Isd - gm * Vsg - gds * Vsd;
              
              stamp2(nd, ns, gds);
              
              if (ns > 0) {
                if (ns > 0) G[ns-1][ns-1] += gm;
                if (ng > 0) G[ns-1][ng-1] -= gm;
              }
              if (nd > 0) {
                if (ns > 0) G[nd-1][ns-1] -= gm;
                if (ng > 0) G[nd-1][ng-1] += gm;
              }

              if (ns > 0) Iv[ns-1] -= Ieq;
              if (nd > 0) Iv[nd-1] += Ieq;

            } else {
              // Saturation
              var Vov = Vsg - Vth;
              var gm = Kp * Vov;
              var gds = 1e-5; 
              var Isd = 0.5 * Kp * Vov * Vov;
              var Ieq = Isd - gm * Vsg - gds * Vsd;

              stamp2(nd, ns, gds);
              
              if (ns > 0) {
                if (ns > 0) G[ns-1][ns-1] += gm;
                if (ng > 0) G[ns-1][ng-1] -= gm;
              }
              if (nd > 0) {
                if (ns > 0) G[nd-1][ns-1] -= gm;
                if (ng > 0) G[nd-1][ng-1] += gm;
              }

              if (ns > 0) Iv[ns-1] -= Ieq;
              if (nd > 0) Iv[nd-1] += Ieq;
            }
          }
          break;
        }

        case 'opamp741': {
        var nInv  = c.pins[1]._node; // IN-
          var nNon  = c.pins[2]._node; // IN+
          var nVneg = c.pins[3]._node; // V-
          var nOut  = c.pins[5]._node; // OUT
          var nVpos = c.pins[6]._node; // V+

          var Vinn = c.pins[1]._voltage || 0;
          var Vinp = c.pins[2]._voltage || 0;
          
          // Read supply rail voltages directly from their nodes (default to 0V if grounded/unconnected)
          var Vvp  = c.pins[6]._voltage || 0;
          var Vvn  = c.pins[3]._voltage || 0;

          var Vdiff = Vinp - Vinn;
          var A = parseFloat(c.props.gain) || 200000;
          
          // 1. Calculate true rail midpoint and usable headroom swing
          // A standard LM741 requires ~1V of internal headroom away from each rail.
          var midV = (Vvp + Vvn) / 2.0;
          var swing = (Vvp - Vvn) / 2.0 - 1.0; 

          var A_eff = 0;

          // 2. Only amplify if the rails actually have enough potential to power the device!
          if (swing > 0) {
            if (Math.abs(Vdiff) < 1e-9) {
              A_eff = A; // Pure linear region near zero
            } else {
              // Smooth Tanh clipping bounded strictly by the live supply rails
              var Vtarget = midV + swing * Math.tanh((A * Vdiff) / swing);
              A_eff = (Vtarget - midV) / Vdiff; 
            }
          } else {
            // Unpowered or dead state: internal gain drops to absolute zero
            A_eff = 0;
          }
          
          // 3. VCVS Matrix Stamping (Referenced strictly to GROUND)
          var Gout = 1.0 / 75.0; // 75 ohm output impedance
          var gm = A_eff * Gout;

          if (nOut > 0) {
            // Internal output resistance to GROUND
            G[nOut-1][nOut-1] += Gout;
            
            // Transconductance (gm * Vdiff)
            if (nNon > 0) G[nOut-1][nNon-1] -= gm;
            if (nInv > 0) G[nOut-1][nInv-1] += gm;
            
            // Apply the rail midpoint offset (will equal 0V if rails are grounded)
            Iv[nOut-1] += midV * Gout;
          }

          // 4. Parasitics to keep matrix stable if power pins are left physically floating
          var g_bleed = 1e-9;
          if (nVpos > 0) G[nVpos-1][nVpos-1] += g_bleed;
          if (nVneg > 0) G[nVneg-1][nVneg-1] += g_bleed;
          
          // 5. High input impedance (2 MOhm differential)
          var Gin = 1.0 / 2e6;
          if (nNon > 0) G[nNon-1][nNon-1] += Gin;
          if (nInv > 0) G[nInv-1][nInv-1] += Gin;
          if (nNon > 0 && nInv > 0) {
            G[nNon-1][nInv-1] -= Gin;
            G[nInv-1][nNon-1] -= Gin;
          }
          break;
        }

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

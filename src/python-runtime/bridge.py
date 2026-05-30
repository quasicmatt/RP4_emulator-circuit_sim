"""
bridge.py — Launched by Electron as a subprocess.
Runs the student's .py file with GPIO shims active,
forwarding all GPIO calls to Electron over WebSocket.
"""
import sys
import os
import json
import threading
import time
import runpy
import traceback

# ── WebSocket client ───────────────────────────────────────────────────────────
try:
    import websocket  # websocket-client library
    _WS_AVAILABLE = True
except ImportError:
    _WS_AVAILABLE = False

WS_PORT = int(os.environ.get("RPI_SIM_WS_PORT", "8765"))
_ws_conn = None
_ws_lock = threading.Lock()
_ws_ready = threading.Event()
_inbound_callbacks = []  # list of (pin, callback) tuples


def _ws_connect():
    global _ws_conn
    url = f"ws://localhost:{WS_PORT}"
    for attempt in range(20):
        try:
            ws = websocket.WebSocketApp(
                url,
                on_open=_on_open,
                on_message=_on_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            _ws_conn = ws
            ws.run_forever()
            break
        except Exception as e:
            time.sleep(0.25)


def _on_open(ws):
    _ws_ready.set()
    print("[bridge] connected to Electron", flush=True)


def _on_message(ws, raw):
    try:
        msg = json.loads(raw)
        # Electron injecting a GPIO input (e.g. switch pressed on canvas)
        if msg.get("type") == "gpio" and msg.get("action") == "inject":
            pin = msg.get("pin")
            val = msg.get("value", 0)
            for cb_pin, cb in _inbound_callbacks:
                if cb_pin == pin:
                    try:
                        cb(pin)
                    except Exception:
                        pass
    except Exception:
        pass


def _on_error(ws, err):
    print(f"[bridge] ws error: {err}", file=sys.stderr, flush=True)


def _on_close(ws, code, msg):
    _ws_ready.clear()


def send_gpio(msg: dict):
    """Called by shims to forward GPIO state to Electron."""
    with _ws_lock:
        if _ws_conn and _ws_ready.is_set():
            try:
                _ws_conn.send(json.dumps(msg))
            except Exception as e:
                print(f"[bridge] send failed: {e}", file=sys.stderr, flush=True)


def register_inbound(pin, callback):
    _inbound_callbacks.append((pin, callback))


# ── Start WS thread ────────────────────────────────────────────────────────────
if _WS_AVAILABLE:
    _t = threading.Thread(target=_ws_connect, daemon=True)
    _t.start()
    _ws_ready.wait(timeout=5.0)
else:
    print("[bridge] websocket-client not installed — GPIO bridge disabled.", file=sys.stderr)
    print("[bridge] Install with: pip install websocket-client", file=sys.stderr)
    _ws_ready.set()  # let execution continue without WS


# ── Expose bridge API to shims ─────────────────────────────────────────────────
# Shims import this module and call bridge.send_gpio(...)
# We place ourselves on sys.modules so shims can find us.
import types
_bridge_module = types.ModuleType("_rpi_sim_bridge")
_bridge_module.send_gpio       = send_gpio
_bridge_module.register_inbound = register_inbound
sys.modules["_rpi_sim_bridge"] = _bridge_module


# ── Run the student script ─────────────────────────────────────────────────────
if len(sys.argv) < 2:
    print("[bridge] Usage: bridge.py <script.py>", file=sys.stderr)
    sys.exit(1)

script_path = sys.argv[1]

if not os.path.isfile(script_path):
    print(f"[bridge] File not found: {script_path}", file=sys.stderr)
    sys.exit(1)

# Set __file__ and working directory so relative imports work naturally
os.chdir(os.path.dirname(os.path.abspath(script_path)))

try:
    runpy.run_path(script_path, run_name="__main__")
except SystemExit:
    pass
except Exception:
    traceback.print_exc()
    sys.exit(1)

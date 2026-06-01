"""
bridge.py — Launched by Electron as a subprocess.
Runs the student's .py file with GPIO shims active,
forwarding all GPIO calls to Electron over WebSocket.

Fix for skipped GPIO writes:
- Uses a queue + dedicated sender thread so rapid back-to-back
  GPIO calls are never dropped — they're buffered and sent in order.
- Sender thread drains the queue as fast as the WebSocket allows.
"""
import sys
import os
import json
import threading
import queue
import time
import runpy
import traceback

# ── WebSocket client ───────────────────────────────────────────────────────────
try:
    import websocket
    _WS_AVAILABLE = True
except ImportError:
    _WS_AVAILABLE = False

WS_PORT   = int(os.environ.get("RPI_SIM_WS_PORT", "8765"))
_ws_conn  = None
_ws_ready = threading.Event()

# Message queue — GPIO calls push here, sender thread drains it
_send_queue   = queue.Queue()
_inbound_cbs  = []  # list of (pin, callback)


# ── Sender thread ──────────────────────────────────────────────────────────────
def _sender_thread():
    """Dedicated thread that drains _send_queue and sends over WebSocket."""
    while True:
        try:
            msg = _send_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        if msg is None:  # poison pill — shut down
            break
        _ws_ready.wait(timeout=5.0)
        if _ws_conn:
            try:
                _ws_conn.send(json.dumps(msg))
            except Exception as e:
                print(f"[bridge] send error: {e}", file=sys.stderr, flush=True)
        _send_queue.task_done()


# ── WebSocket connection ───────────────────────────────────────────────────────
def _ws_thread():
    global _ws_conn
    url = f"ws://localhost:{WS_PORT}"
    for attempt in range(30):
        try:
            ws = websocket.WebSocketApp(
                url,
                on_open=_on_open,
                on_message=_on_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            _ws_conn = ws
            ws.run_forever(ping_interval=10, ping_timeout=5)
            break
        except Exception as e:
            time.sleep(0.25)


def _on_open(ws):
    _ws_ready.set()
    print("[bridge] connected to Electron", flush=True)


def _on_message(ws, raw):
    try:
        msg = json.loads(raw)
        if msg.get("type") == "gpio" and msg.get("action") == "inject":
            pin = msg.get("pin")
            val = msg.get("value", 0)
            for cb_pin, cb in list(_inbound_cbs):
                if cb_pin == pin:
                    try:
                        # FIX: Pass 'val' argument to the callback thread so the 
                        # Python shim actually receives the HIGH/LOW state from JS.
                        threading.Thread(target=cb, args=(pin, val), daemon=True).start()
                    except Exception:
                        pass
    except Exception:
        pass


def _on_error(ws, err):
    print(f"[bridge] ws error: {err}", file=sys.stderr, flush=True)


def _on_close(ws, code, msg):
    _ws_ready.clear()


# ── Public API (called by shims) ───────────────────────────────────────────────
def send_gpio(msg: dict):
    """
    Queue a GPIO message for delivery to Electron.
    Non-blocking — returns immediately so Python code isn't delayed.
    The sender thread delivers messages in order at WebSocket speed.
    """
    _send_queue.put(msg)


def register_inbound(pin, callback):
    """Register a callback for GPIO input injection from the circuit canvas."""
    _inbound_cbs.append((pin, callback))


# ── Start threads ──────────────────────────────────────────────────────────────
if _WS_AVAILABLE:
    _t_ws = threading.Thread(target=_ws_thread, daemon=True)
    _t_ws.start()

    _t_send = threading.Thread(target=_sender_thread, daemon=True)
    _t_send.start()

    # Wait for connection before running student code (up to 3s)
    _ws_ready.wait(timeout=3.0)
else:
    print("[bridge] websocket-client not installed — GPIO bridge disabled.", file=sys.stderr)
    print("[bridge] Install with: pip install websocket-client", file=sys.stderr)
    _ws_ready.set()

# ── Expose bridge on sys.modules so shims can import it ───────────────────────
import types
_bridge_module = types.ModuleType("_rpi_sim_bridge")
_bridge_module.send_gpio        = send_gpio
_bridge_module.register_inbound = register_inbound
sys.modules["_rpi_sim_bridge"]  = _bridge_module

# ── Run student script ─────────────────────────────────────────────────────────
if len(sys.argv) < 2:
    print("[bridge] Usage: bridge.py <script.py>", file=sys.stderr)
    sys.exit(1)

script_path = sys.argv[1]
if not os.path.isfile(script_path):
    print(f"[bridge] File not found: {script_path}", file=sys.stderr)
    sys.exit(1)

os.chdir(os.path.dirname(os.path.abspath(script_path)))

try:
    runpy.run_path(script_path, run_name="__main__")
except SystemExit:
    pass
except Exception:
    traceback.print_exc()
    sys.exit(1)

# Drain remaining queued messages before exit
try:
    _send_queue.join()
except Exception:
    pass
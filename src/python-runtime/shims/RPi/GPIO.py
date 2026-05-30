"""
RPi/GPIO.py  —  RPi.GPIO shim for the RPi Circuit Simulator.

Drop-in replacement for RPi.GPIO.  All GPIO calls are intercepted and
forwarded to Electron's circuit canvas via the bridge WebSocket.

Supported:
  setmode(), setwarnings(), setup(), output(), input(),
  add_event_detect(), remove_event_detect(), add_event_callback(),
  wait_for_edge(), cleanup(), PWM class
"""
import time
import threading

try:
    import _rpi_sim_bridge as _bridge
    _HAS_BRIDGE = True
except ImportError:
    _HAS_BRIDGE = False

# ── Constants (mirror real RPi.GPIO) ─────────────────────────────────────────
BCM  = 11
BOARD = 10
IN   = 1
OUT  = 0
HIGH = 1
LOW  = 0
RISING  = 31
FALLING = 32
BOTH    = 33
PUD_OFF  = 20
PUD_DOWN = 21
PUD_UP   = 22

# ── Internal state ────────────────────────────────────────────────────────────
_mode         = None
_pin_state    = {}     # pin -> 0|1
_pin_dir      = {}     # pin -> IN|OUT
_event_cbs    = {}     # pin -> list of callbacks
_warnings     = True


def _send(action, pin, value=None, **kwargs):
    if not _HAS_BRIDGE:
        return
    msg = {"type": "gpio", "library": "RPi.GPIO", "action": action, "pin": pin}
    if value is not None:
        msg["value"] = value
    msg.update(kwargs)
    _bridge.send_gpio(msg)


# ── Public API ────────────────────────────────────────────────────────────────
def setmode(mode):
    global _mode
    _mode = mode


def setwarnings(flag):
    global _warnings
    _warnings = bool(flag)


def setup(pin, direction, pull_up_down=PUD_OFF, initial=LOW):
    pins = [pin] if isinstance(pin, int) else list(pin)
    for p in pins:
        _pin_dir[p]   = direction
        _pin_state[p] = initial if direction == OUT else LOW
        _send("setup", p, value=_pin_state[p],
              direction="OUT" if direction == OUT else "IN",
              pull=pull_up_down)
        if direction == IN and _HAS_BRIDGE:
            _bridge.register_inbound(p, _handle_inbound)


def output(pin, value):
    pins   = [pin]   if isinstance(pin, int)  else list(pin)
    values = [value] if isinstance(value, int) else list(value)
    if len(values) == 1:
        values = values * len(pins)
    for p, v in zip(pins, values):
        v = HIGH if v else LOW
        _pin_state[p] = v
        _send("write", p, value=v)


def input(pin):
    return _pin_state.get(pin, LOW)


def add_event_detect(pin, edge, callback=None, bouncetime=0):
    if pin not in _event_cbs:
        _event_cbs[pin] = []
    if callback:
        _event_cbs[pin].append((edge, callback))
    _send("event_detect", pin, edge=edge, bouncetime=bouncetime)


def remove_event_detect(pin):
    _event_cbs.pop(pin, None)
    _send("event_remove", pin)


def add_event_callback(pin, callback):
    if pin not in _event_cbs:
        _event_cbs[pin] = []
    _event_cbs[pin].append((BOTH, callback))


def wait_for_edge(pin, edge, timeout=None, bouncetime=0):
    """Blocking wait — woken by inbound GPIO injection from circuit canvas."""
    event = threading.Event()
    def _cb(p):
        event.set()
    _bridge.register_inbound(pin, _cb)
    fired = event.wait(timeout=timeout / 1000.0 if timeout else None)
    return pin if fired else None


def cleanup(pin=None):
    if pin is None:
        _pin_state.clear()
        _pin_dir.clear()
        _event_cbs.clear()
        _send("cleanup", -1)
    else:
        pins = [pin] if isinstance(pin, int) else list(pin)
        for p in pins:
            _pin_state.pop(p, None)
            _pin_dir.pop(p, None)
            _event_cbs.pop(p, None)
            _send("cleanup", p)


def _handle_inbound(pin):
    """Called when Electron injects a GPIO state change (e.g. switch pressed)."""
    new_val = 1 - _pin_state.get(pin, 0)
    _pin_state[pin] = new_val
    for edge, cb in _event_cbs.get(pin, []):
        if edge == BOTH or (edge == RISING and new_val) or (edge == FALLING and not new_val):
            threading.Thread(target=cb, args=(pin,), daemon=True).start()


# ── PWM class ─────────────────────────────────────────────────────────────────
class PWM:
    def __init__(self, pin, frequency):
        self._pin  = pin
        self._freq = frequency
        self._dc   = 0
        self._running = False

    def start(self, dutycycle):
        self._dc      = dutycycle
        self._running = True
        _send("pwm_start", self._pin, value=dutycycle, frequency=self._freq)

    def ChangeDutyCycle(self, dutycycle):
        self._dc = dutycycle
        _send("pwm_duty", self._pin, value=dutycycle)

    def ChangeFrequency(self, frequency):
        self._freq = frequency
        _send("pwm_freq", self._pin, value=frequency)

    def stop(self):
        self._running = False
        _send("pwm_stop", self._pin, value=0)

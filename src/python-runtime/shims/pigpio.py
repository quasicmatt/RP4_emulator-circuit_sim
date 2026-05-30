"""
pigpio.py  —  pigpio shim for the RPi Circuit Simulator.

Emulates the pigpio library's pi() object interface.
GPIO state is forwarded to Electron via the bridge WebSocket.
"""
import time
import threading

try:
    import _rpi_sim_bridge as _bridge
    _HAS_BRIDGE = True
except ImportError:
    _HAS_BRIDGE = False

# ── Constants ─────────────────────────────────────────────────────────────────
INPUT  = 0
OUTPUT = 1
HIGH   = 1
LOW    = 0
RISING_EDGE  = 0
FALLING_EDGE = 1
EITHER_EDGE  = 2

# Callback handle sentinel
TIMEOUT = 0


def _send(action, pin, value=None, **kwargs):
    if not _HAS_BRIDGE:
        return
    msg = {"type": "gpio", "library": "pigpio", "action": action, "pin": pin}
    if value is not None:
        msg["value"] = value
    msg.update(kwargs)
    _bridge.send_gpio(msg)


class _Callback:
    def __init__(self, pin, edge, func):
        self.pin  = pin
        self.edge = edge
        self.func = func

    def cancel(self):
        pass


class pi:
    """Emulated pigpio.pi() connection object."""

    def __init__(self, host="localhost", port=8888, show_errors=True):
        self._pin_state = {}
        self._callbacks = {}   # pin -> list of _Callback

    def connected(self):
        return True

    def set_mode(self, pin, mode):
        self._pin_state.setdefault(pin, 0)
        _send("setup", pin, value=0,
              direction="OUT" if mode == OUTPUT else "IN")
        if mode == INPUT and _HAS_BRIDGE:
            _bridge.register_inbound(pin, self._handle_inbound)

    def get_mode(self, pin):
        return INPUT  # safe default for simulator

    def write(self, pin, value):
        self._pin_state[pin] = value
        _send("write", pin, value=value)

    def read(self, pin):
        return self._pin_state.get(pin, 0)

    def set_pull_up_down(self, pin, pud):
        pass  # no physical pull-ups in simulation

    # ── PWM ──────────────────────────────────────────────────────────────────
    def set_PWM_dutycycle(self, pin, dutycycle):
        """dutycycle 0-255"""
        dc_pct = dutycycle / 255.0 * 100
        _send("pwm_duty", pin, value=dc_pct)

    def set_PWM_frequency(self, pin, frequency):
        _send("pwm_freq", pin, value=frequency)

    def get_PWM_dutycycle(self, pin):
        return 0

    # ── Hardware PWM ─────────────────────────────────────────────────────────
    def hardware_PWM(self, pin, frequency, dutycycle):
        """dutycycle 0-1000000"""
        dc_pct = dutycycle / 1_000_000 * 100
        _send("pwm_start", pin, value=dc_pct, frequency=frequency)

    # ── Servo ─────────────────────────────────────────────────────────────────
    def set_servo_pulsewidth(self, pin, pulsewidth):
        _send("servo", pin, value=pulsewidth)

    # ── Callbacks ─────────────────────────────────────────────────────────────
    def callback(self, pin, edge=EITHER_EDGE, func=None):
        cb = _Callback(pin, edge, func)
        self._callbacks.setdefault(pin, []).append(cb)
        if _HAS_BRIDGE:
            _bridge.register_inbound(pin, self._handle_inbound)
        return cb

    def wait_for_edge(self, pin, edge, wait_timeout=5.0):
        event = threading.Event()
        def _cb(p):
            event.set()
        _bridge.register_inbound(pin, _cb)
        return event.wait(timeout=wait_timeout / 1000.0)

    def _handle_inbound(self, pin):
        new_val = 1 - self._pin_state.get(pin, 0)
        self._pin_state[pin] = new_val
        tick = int(time.monotonic() * 1e6) & 0xFFFFFFFF
        for cb in self._callbacks.get(pin, []):
            edge = cb.edge
            if (edge == EITHER_EDGE or
                (edge == RISING_EDGE  and new_val == 1) or
                (edge == FALLING_EDGE and new_val == 0)):
                if cb.func:
                    threading.Thread(target=cb.func,
                                     args=(pin, new_val, tick),
                                     daemon=True).start()

    # ── Cleanup ───────────────────────────────────────────────────────────────
    def stop(self):
        _send("cleanup", -1)

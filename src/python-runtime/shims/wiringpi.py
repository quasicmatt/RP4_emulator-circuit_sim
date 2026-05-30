"""
wiringpi.py  —  WiringPi shim for the RPi Circuit Simulator.

Mirrors the wiringpi Python bindings API.
"""
try:
    import _rpi_sim_bridge as _bridge
    _HAS_BRIDGE = True
except ImportError:
    _HAS_BRIDGE = False

# ── Constants ─────────────────────────────────────────────────────────────────
INPUT  = 0
OUTPUT = 1
PWM_OUTPUT = 2
HIGH = 1
LOW  = 0

_pin_state = {}


def _send(action, pin, value=None, **kwargs):
    if not _HAS_BRIDGE:
        return
    msg = {"type": "gpio", "library": "wiringpi", "action": action, "pin": pin}
    if value is not None:
        msg["value"] = value
    msg.update(kwargs)
    _bridge.send_gpio(msg)


def wiringPiSetup():
    return 0

def wiringPiSetupGpio():
    return 0

def wiringPiSetupPhys():
    return 0

def wiringPiSetupSys():
    return 0

def pinMode(pin, mode):
    _pin_state.setdefault(pin, 0)
    _send("setup", pin, value=0,
          direction="OUT" if mode == OUTPUT else ("PWM" if mode == PWM_OUTPUT else "IN"))

def digitalWrite(pin, value):
    _pin_state[pin] = value
    _send("write", pin, value=value)

def digitalRead(pin):
    return _pin_state.get(pin, 0)

def pullUpDnControl(pin, pud):
    pass

def pwmWrite(pin, value):
    """value 0-1024"""
    dc_pct = value / 1024.0 * 100
    _send("pwm_duty", pin, value=dc_pct)

def analogWrite(pin, value):
    _send("pwm_duty", pin, value=value)

def analogRead(pin):
    return 0

def delay(ms):
    import time
    time.sleep(ms / 1000.0)

def delayMicroseconds(us):
    import time
    time.sleep(us / 1_000_000.0)

def millis():
    import time
    return int(time.monotonic() * 1000)

def micros():
    import time
    return int(time.monotonic() * 1_000_000)

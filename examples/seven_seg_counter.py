"""
example_7seg.py — 7-segment display counter (0-9)

Uses 7 GPIO pins to drive a common-anode 7-segment display.

GPIO wiring (BCM → segment):
  GPIO2  → a      GPIO3  → b
  GPIO4  → c      GPIO5  → d
  GPIO6  → e      GPIO7  → f
  GPIO8  → g

Circuit setup:
  1. Add a 7-Seg Display component
  2. Set commonAnode = true
  3. Connect each segment pin to the matching GPIO
  4. Connect COM to VCC (3.3V)
"""
import RPi.GPIO as GPIO
import time

# BCM pin → segment mapping
SEGMENTS = {
    'a': 2,  'b': 3,  'c': 4,  'd': 5,
    'e': 6,  'f': 7,  'g': 8
}

# Common-anode digit patterns (0 = segment ON)
DIGITS = {
    0: {'a':0,'b':0,'c':0,'d':0,'e':0,'f':0,'g':1},
    1: {'a':1,'b':0,'c':0,'d':1,'e':1,'f':1,'g':1},
    2: {'a':0,'b':0,'c':1,'d':0,'e':0,'f':1,'g':0},
    3: {'a':0,'b':0,'c':0,'d':0,'e':1,'f':1,'g':0},
    4: {'a':1,'b':0,'c':0,'d':1,'e':1,'f':0,'g':0},
    5: {'a':0,'b':1,'c':0,'d':0,'e':1,'f':0,'g':0},
    6: {'a':0,'b':1,'c':0,'d':0,'e':0,'f':0,'g':0},
    7: {'a':0,'b':0,'c':0,'d':1,'e':1,'f':1,'g':1},
    8: {'a':0,'b':0,'c':0,'d':0,'e':0,'f':0,'g':0},
    9: {'a':0,'b':0,'c':0,'d':0,'e':1,'f':0,'g':0},
}

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

for pin in SEGMENTS.values():
    GPIO.setup(pin, GPIO.OUT, initial=GPIO.HIGH)  # HIGH = OFF for common anode

print("Counting 0-9 in a loop")

try:
    while True:
        for digit in range(10):
            pattern = DIGITS[digit]
            for seg, pin in SEGMENTS.items():
                GPIO.output(pin, pattern[seg])
            print(f"  Displaying: {digit}")
            time.sleep(0.8)

except KeyboardInterrupt:
    pass

finally:
    for pin in SEGMENTS.values():
        GPIO.output(pin, GPIO.HIGH)
    GPIO.cleanup()
    print("Done")

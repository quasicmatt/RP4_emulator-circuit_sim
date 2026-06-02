"""
example_blink.py — Demo script for RPi Circuit Sim

Blinks GPIO17 and shows a counter on the console.
Works on both a real Raspberry Pi and inside the simulator.

Circuit setup (in the simulator):
  1. Add an LED component
  2. Add a Resistor (330Ω)
  3. Add GND
  4. Wire: GPIO17 → Resistor → LED Anode → LED Cathode → GND
  5. Set LED's "GPIO Pin (BCM)" to 17 in its properties
  6. Press Run
"""
import RPi.GPIO as GPIO
import time

LED_PIN = 17

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(LED_PIN, GPIO.OUT)

print("Starting blink loop — Ctrl+C or press Stop to exit")

try:
    count = 0
    while True:
        GPIO.output(LED_PIN, GPIO.HIGH)
        print(f"  [{count:04d}] LED ON")
        time.sleep(0.5)

        GPIO.output(LED_PIN, GPIO.LOW)
        print(f"  [{count:04d}] LED OFF")
        time.sleep(0.5)

        count += 1

except KeyboardInterrupt:
    print("\nStopped by user")

finally:
    GPIO.cleanup()
    print("GPIO cleaned up")

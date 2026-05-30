"""
example_pwm_fade.py — PWM LED fade demo

Fades an LED in and out using hardware PWM.

Circuit setup:
  1. Add LED, set GPIO Pin to 18
  2. Add 330Ω Resistor between LED and GND
"""
import RPi.GPIO as GPIO
import time

LED_PIN = 18  # GPIO18 supports PWM

GPIO.setmode(GPIO.BCM)
GPIO.setup(LED_PIN, GPIO.OUT)

pwm = GPIO.PWM(LED_PIN, 100)  # 100 Hz
pwm.start(0)

print("Fading LED — press Stop to exit")

try:
    while True:
        # Fade in
        for dc in range(0, 101, 2):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.02)
        # Fade out
        for dc in range(100, -1, -2):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.02)

except KeyboardInterrupt:
    pass

finally:
    pwm.stop()
    GPIO.cleanup()
    print("Done")

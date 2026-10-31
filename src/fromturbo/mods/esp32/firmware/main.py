# fromturbo ESP32 firmware (MicroPython)
#
# Lets fromturbo's ESP32 blocks control this board over USB or Bluetooth.
# fromturbo can install this file for you: ESP32 panel -> "Install to board".
# (The board needs MicroPython on it first: https://micropython.org/download/ )
#
# Your own code: edit on_message() below. Anything sent with the
# "send [ ] to ESP32" block arrives there, and send_to_scratch("text")
# fires the "when ESP32 sends" hats in your project.

import sys
import time
import select
from machine import Pin, ADC, PWM

VERSION = "1"
LED_PIN = 2          # built-in LED on most ESP32 boards
BLE_NAME = "fromturbo ESP32"


# ---------- your code ----------

def on_message(text):
    # Called with the text from the "send [ ] to ESP32" block.
    if text == "ping":
        send_to_scratch("pong")


# ---------- everything below makes the blocks work ----------

ble = None
ble_conns = set()
ble_tx = None
ble_rx = None
ble_in = bytearray()

try:
    import bluetooth

    NUS = bluetooth.UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    TX = (bluetooth.UUID("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY)
    RX = (bluetooth.UUID("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"), bluetooth.FLAG_WRITE | bluetooth.FLAG_WRITE_NO_RESPONSE)

    def ble_advertise():
        flags = b"\x02\x01\x06"
        uuid = bytes(NUS)
        adv = flags + bytes((len(uuid) + 1, 0x07)) + uuid
        name = BLE_NAME.encode()
        resp = bytes((len(name) + 1, 0x09)) + name
        ble.gap_advertise(100000, adv_data=adv, resp_data=resp)

    def ble_irq(event, data):
        if event == 1:  # central connected
            ble_conns.add(data[0])
        elif event == 2:  # central disconnected
            ble_conns.discard(data[0])
            ble_advertise()
        elif event == 3:  # write
            if data[1] == ble_rx:
                ble_in.extend(ble.gatts_read(ble_rx))

    ble = bluetooth.BLE()
    ble.active(True)
    ((ble_tx, ble_rx),) = ble.gatts_register_services(((NUS, (TX, RX)),))
    ble.gatts_set_buffer(ble_rx, 128, True)
    ble.irq(ble_irq)
    ble_advertise()
except Exception:
    ble = None  # no Bluetooth on this board (ESP32-S2) or in this MicroPython build


def send_line(line):
    sys.stdout.write(line + "\n")
    if ble and ble_conns:
        data = (line + "\n").encode()
        for conn in list(ble_conns):
            for i in range(0, len(data), 20):
                try:
                    ble.gatts_notify(conn, ble_tx, data[i:i + 20])
                except Exception:
                    pass


def send_to_scratch(text):
    send_line("m " + str(text))


pins = {}       # pin number -> (kind, object)
watched = {}    # pin number -> last value


def pin_out(n):
    kind, obj = pins.get(n, (None, None))
    if kind != "out":
        if kind in ("pwm", "servo"):
            obj.deinit()
        obj = Pin(n, Pin.OUT)
        pins[n] = ("out", obj)
    return obj


def pin_in(n, pull=None, force=False):
    kind, obj = pins.get(n, (None, None))
    if kind in ("in", "pullup", "out") and not force:
        return obj
    if kind in ("pwm", "servo"):
        obj.deinit()
    obj = Pin(n, Pin.IN, pull)
    pins[n] = ("pullup" if pull else "in", obj)
    return obj


def pin_pwm(n, freq):
    kind, obj = pins.get(n, (None, None))
    want = "servo" if freq == 50 else "pwm"
    if kind != want:
        if kind in ("pwm", "servo"):
            obj.deinit()
        obj = PWM(Pin(n), freq=freq)
        pins[n] = (want, obj)
    return obj


def handle(line):
    line = line.strip()
    if not line:
        return
    cmd = line[0]
    rest = line[2:]
    if cmd == "X":
        on_message(rest)
        return
    if cmd == "?":
        send_line("ok fromturbo-esp32 " + VERSION + " micropython")
        return
    parts = rest.split()
    try:
        a = int(parts[0])
        b = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        send_line("e bad command")
        return

    if cmd == "L":
        pin_out(LED_PIN).value(1 if a else 0)
    elif cmd == "M":
        if b == 1:
            pin_out(a)
        elif b == 3:
            pin_in(a, Pin.PULL_UP, True)
        else:
            pin_in(a, None, True)
    elif cmd == "D":
        pin_out(a).value(1 if b else 0)
    elif cmd == "R":
        send_line("r %d %d" % (b, pin_in(a).value()))
    elif cmd == "A":
        pins.pop(a, None)
        adc = ADC(Pin(a))
        try:
            adc.atten(ADC.ATTN_11DB)
        except Exception:
            pass
        send_line("r %d %d" % (b, adc.read_u16() >> 4))
    elif cmd == "P":
        pin_pwm(a, 1000).duty_u16(max(0, min(255, b)) * 257)
    elif cmd == "S":
        angle = max(0, min(180, b))
        pulse_us = 500 + angle * 2000 // 180
        pin_pwm(a, 50).duty_u16(pulse_us * 65535 // 20000)
    elif cmd == "T":
        try:
            from machine import TouchPad
            value = TouchPad(Pin(a)).read()
        except Exception:
            value = -1
        send_line("r %d %d" % (b, value))
    elif cmd == "W":
        v = pin_in(a).value()
        watched[a] = v
        send_line("c %d %d" % (a, v))
    elif cmd == "U":
        watched.pop(a, None)
    else:
        send_line("e unknown command " + cmd)


def run():
    poller = select.poll()
    poller.register(sys.stdin, select.POLLIN)
    usb_line = ""
    ble_line = ""
    last_watch = time.ticks_ms()
    send_line("ready fromturbo-esp32 " + VERSION + " micropython")
    while True:
        # USB: read whatever has arrived, one character at a time so we never block mid-line
        while poller.poll(0):
            c = sys.stdin.read(1)
            if c in ("\n", "\r"):
                if usb_line:
                    try:
                        handle(usb_line)
                    except Exception as e:
                        send_line("e " + str(e))
                usb_line = ""
            elif len(usb_line) < 240:
                usb_line += c

        # Bluetooth: bytes collected by ble_irq
        if ble_in:
            n = len(ble_in)
            chunk = bytes(ble_in[:n])
            ble_in[:n] = b""  # bytes that arrive meanwhile stay for next time
            for c in chunk.decode("utf-8", "ignore"):
                if c in ("\n", "\r"):
                    if ble_line:
                        try:
                            handle(ble_line)
                        except Exception as e:
                            send_line("e " + str(e))
                    ble_line = ""
                elif len(ble_line) < 240:
                    ble_line += c

        # Report watched pins that changed
        if time.ticks_diff(time.ticks_ms(), last_watch) >= 15:
            last_watch = time.ticks_ms()
            for n in list(watched):
                v = pin_in(n).value()
                if v != watched[n]:
                    watched[n] = v
                    send_line("c %d %d" % (n, v))

        time.sleep_ms(2)


run()

// Talks to an ESP32 running the fromturbo firmware, over USB (Web Serial) or
// Bluetooth (Web Bluetooth, Nordic UART service). Both carry the same text protocol:
// one command per line, see firmware/fromturbo-esp32.ino for the list.

export const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // we write here
const NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // board notifies here

// USB-to-serial chips found on ESP32 boards: Silicon Labs CP210x, WCH CH340/CH9102,
// FTDI, and Espressif's own USB (S2/S3/C3/C6).
export const USB_FILTERS = [
    {usbVendorId: 0x10c4},
    {usbVendorId: 0x1a86},
    {usbVendorId: 0x0403},
    {usbVendorId: 0x303a}
];

const REPLY_TIMEOUT = 1500;
const HELLO_TIMEOUT = 5000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const supports = {
    usb: () => typeof navigator !== 'undefined' && !!navigator.serial,
    bluetooth: () => typeof navigator !== 'undefined' && !!navigator.bluetooth
};

// ---------- transports: open(), write(bytes), close(), onData(text), onClose() ----------

class SerialTransport {
    constructor (port) {
        this.kind = 'usb';
        this.port = port;
        this.onData = () => {};
        this.onClose = () => {};
        this.writeChain = Promise.resolve();
        this.closed = false;
    }
    async open () {
        await this.port.open({baudRate: 115200});
        // Leave the auto-reset lines released so the board runs its program
        // (DTR/RTS low = EN high, IO0 high on the usual ESP32 auto-reset circuit).
        try {
            await this.port.setSignals({dataTerminalReady: false, requestToSend: false});
        } catch (e) {
            // some USB chips don't support it; harmless
        }
        this.writer = this.port.writable.getWriter();
        this.readLoop();
    }
    async readLoop () {
        const decoder = new TextDecoder();
        while (!this.closed && this.port.readable) {
            this.reader = this.port.readable.getReader();
            try {
                for (;;) {
                    const {value, done} = await this.reader.read();
                    if (done) break;
                    if (value) this.onData(decoder.decode(value, {stream: true}));
                }
            } catch (e) {
                // unplugged, or a framing error — the outer loop retries while the port is open
            } finally {
                try {
                    this.reader.releaseLock();
                } catch (e) {
                    // already released
                }
            }
            if (!this.closed) await sleep(50);
        }
        this.finish();
    }
    write (bytes) {
        this.writeChain = this.writeChain.then(() => this.writer.write(bytes));
        return this.writeChain;
    }
    finish () {
        if (this.finished) return;
        this.finished = true;
        this.onClose();
    }
    async close () {
        this.closed = true;
        try {
            if (this.reader) await this.reader.cancel();
        } catch (e) {
            // ignore
        }
        try {
            await this.writeChain;
            this.writer.releaseLock();
        } catch (e) {
            // ignore
        }
        try {
            await this.port.close();
        } catch (e) {
            // ignore
        }
        this.finish();
    }
}

class BluetoothTransport {
    constructor (device) {
        this.kind = 'bluetooth';
        this.device = device;
        this.onData = () => {};
        this.onClose = () => {};
        this.writeChain = Promise.resolve();
        this.handleValue = this.handleValue.bind(this);
        this.handleGone = this.handleGone.bind(this);
        this.decoder = new TextDecoder();
    }
    async open () {
        const server = await this.device.gatt.connect();
        const service = await server.getPrimaryService(NUS_SERVICE);
        this.rx = await service.getCharacteristic(NUS_RX);
        this.tx = await service.getCharacteristic(NUS_TX);
        this.tx.addEventListener('characteristicvaluechanged', this.handleValue);
        this.device.addEventListener('gattserverdisconnected', this.handleGone);
        await this.tx.startNotifications();
    }
    handleValue (event) {
        const v = event.target.value;
        this.onData(this.decoder.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), {stream: true}));
    }
    handleGone () {
        if (this.finished) return;
        this.finished = true;
        this.device.removeEventListener('gattserverdisconnected', this.handleGone);
        if (this.tx) this.tx.removeEventListener('characteristicvaluechanged', this.handleValue);
        this.onClose();
    }
    write (bytes) {
        // Bluetooth can only do one operation at a time, 20 bytes each.
        const send = async () => {
            for (let i = 0; i < bytes.length; i += 20) {
                const part = bytes.slice(i, i + 20);
                if (this.rx.properties.writeWithoutResponse && this.rx.writeValueWithoutResponse) {
                    await this.rx.writeValueWithoutResponse(part);
                } else {
                    await this.rx.writeValue(part);
                }
            }
        };
        this.writeChain = this.writeChain.then(send, send);
        return this.writeChain;
    }
    close () {
        try {
            if (this.device.gatt.connected) this.device.gatt.disconnect();
        } catch (e) {
            // ignore
        }
        this.handleGone();
    }
}

// ---------- the board ----------

/**
 * One ESP32 connection shared by the blocks and the panel.
 * Events: 'status' (state), 'line' (text), 'message' (text from sendToScratch), 'pin' (pin, value)
 */
export class Board {
    constructor () {
        this.transport = null;
        this.state = 'disconnected'; // disconnected | connecting | connected
        this.info = '';
        this.lastError = '';
        this.buffer = '';
        this.listeners = {};
        this.pending = new Map(); // reply id -> {resolve, timer}
        this.nextId = 1;
        this.pinValues = new Map(); // watched pin -> 0|1
        this.watching = new Set();
        this.rawListener = null; // set while installing firmware
        this.log = [];
        this.lastBluetoothDevice = null;
    }

    on (event, fn) {
        (this.listeners[event] = this.listeners[event] || new Set()).add(fn);
        return () => this.listeners[event].delete(fn);
    }
    emit (event, ...args) {
        for (const fn of this.listeners[event] || []) {
            try {
                fn(...args);
            } catch (e) {
                console.error('[fromturbo esp32]', e);
            }
        }
    }
    setState (state, error = '') {
        this.state = state;
        this.lastError = error;
        this.emit('status', state);
    }
    get connected () {
        return this.state === 'connected';
    }
    get kind () {
        return this.transport ? this.transport.kind : null;
    }

    addLog (line) {
        this.log.push(line);
        if (this.log.length > 60) this.log.shift();
        this.emit('log', line);
    }

    // ----- connecting -----

    /** Ask the user to pick a USB port. Must be called from a click. */
    async pickUSB ({all = false} = {}) {
        if (!supports.usb()) throw new Error('USB needs Chrome or Edge on a computer.');
        const port = await navigator.serial.requestPort(all ? {} : {filters: USB_FILTERS});
        return this.attach(new SerialTransport(port));
    }

    /** Reconnect to a USB port the user already picked before, without asking. */
    async reconnectUSB () {
        if (!supports.usb()) return false;
        const ports = await navigator.serial.getPorts();
        if (!ports.length) return false;
        await this.attach(new SerialTransport(ports[0]));
        return true;
    }

    /** Ask the user to pick a Bluetooth board. Must be called from a click. */
    async pickBluetooth () {
        if (!supports.bluetooth()) throw new Error('Bluetooth needs Chrome or Edge.');
        const device = await navigator.bluetooth.requestDevice({
            filters: [{services: [NUS_SERVICE]}, {namePrefix: 'fromturbo'}],
            optionalServices: [NUS_SERVICE]
        });
        this.lastBluetoothDevice = device;
        return this.attach(new BluetoothTransport(device));
    }

    /** Reconnect to the Bluetooth board picked earlier on this page. */
    async reconnectBluetooth () {
        if (!this.lastBluetoothDevice) return false;
        await this.attach(new BluetoothTransport(this.lastBluetoothDevice));
        return true;
    }

    async attach (transport) {
        await this.disconnect();
        this.setState('connecting');
        this.transport = transport;
        this.buffer = '';
        transport.onData = text => this.handleData(text);
        transport.onClose = () => {
            if (this.transport !== transport) return;
            this.transport = null;
            this.failPending();
            this.watching.clear();
            this.pinValues.clear();
            this.setState('disconnected', this.state === 'connected' ? 'The ESP32 disconnected.' : this.lastError);
        };
        try {
            await transport.open();
            this.info = await this.hello();
            this.setState('connected');
        } catch (e) {
            const message = e && e.message ? e.message : String(e);
            this.lastError = message;
            await this.disconnect(message);
            throw e;
        }
    }

    /** Wait for the firmware to answer "?" (the board may be rebooting from the port opening). */
    hello () {
        return new Promise((resolve, reject) => {
            let done = false;
            const finish = (fn, value) => {
                if (done) return;
                done = true;
                clearInterval(ping);
                clearTimeout(timer);
                off();
                fn(value);
            };
            const off = this.on('line', line => {
                if (line.startsWith('ok fromturbo-esp32') || line.startsWith('ready fromturbo-esp32')) {
                    finish(resolve, line.split(' ').slice(1)
                        .join(' '));
                }
            });
            const ask = () => this.send('?').catch(() => {});
            const ping = setInterval(ask, 700);
            const timer = setTimeout(() => finish(reject, new Error(
                'The board didn\'t answer. Is the fromturbo firmware on it? (ESP32 panel → Set up your board)'
            )), HELLO_TIMEOUT);
            ask();
        });
    }

    async disconnect (error = '') {
        const t = this.transport;
        this.transport = null;
        this.failPending();
        this.watching.clear();
        this.pinValues.clear();
        if (t) await t.close();
        if (this.state !== 'disconnected' || error) this.setState('disconnected', error);
    }

    failPending () {
        for (const {resolve, timer} of this.pending.values()) {
            clearTimeout(timer);
            resolve(null);
        }
        this.pending.clear();
    }

    // ----- protocol -----

    handleData (text) {
        if (this.rawListener) this.rawListener(text);
        this.buffer += text;
        let i;
        while ((i = this.buffer.search(/[\r\n]/)) !== -1) {
            const line = this.buffer.slice(0, i).trim();
            this.buffer = this.buffer.slice(i + 1);
            if (line) this.handleLine(line);
        }
        if (this.buffer.length > 4096) this.buffer = this.buffer.slice(-1024);
    }

    handleLine (line) {
        this.addLog(`← ${line}`);
        this.emit('line', line);
        const [type, a, ...rest] = line.split(' ');
        if (type === 'r') {
            const p = this.pending.get(Number(a));
            if (p) {
                clearTimeout(p.timer);
                this.pending.delete(Number(a));
                p.resolve(Number(rest[0]));
            }
        } else if (type === 'c') {
            const pin = Number(a);
            const value = Number(rest[0]) ? 1 : 0;
            this.pinValues.set(pin, value);
            this.emit('pin', pin, value);
        } else if (type === 'm') {
            this.emit('message', line.slice(2));
        } else if (type === 'ready' && this.connected) {
            // The board rebooted by itself: watched pins are forgotten on its side.
            const pins = [...this.watching];
            this.watching.clear();
            for (const pin of pins) this.watch(pin);
        }
    }

    send (line) {
        if (!this.transport) return Promise.reject(new Error('Not connected'));
        if (!line.startsWith('?')) this.addLog(`→ ${line}`);
        return this.transport.write(new TextEncoder().encode(`${line}\n`));
    }

    /** Send a command that answers "r <id> <value>". Resolves to the number, or null. */
    request (cmd, pin) {
        if (!this.connected) return Promise.resolve(null);
        const id = this.nextId++;
        if (this.nextId > 99999) this.nextId = 1;
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                resolve(null);
            }, REPLY_TIMEOUT);
            this.pending.set(id, {resolve, timer});
            this.send(`${cmd} ${pin} ${id}`).catch(() => {
                clearTimeout(timer);
                this.pending.delete(id);
                resolve(null);
            });
        });
    }

    command (line) {
        if (!this.connected) return Promise.resolve(false);
        return this.send(line).then(() => true, () => false);
    }

    watch (pin) {
        if (!this.connected || this.watching.has(pin)) return;
        this.watching.add(pin);
        this.command(`W ${pin}`);
    }

    // ----- installing the MicroPython firmware through the raw REPL -----

    /**
     * Copy main.py onto a board that runs MicroPython, then restart it.
     * Uses whichever USB port is connected, or asks for one (call from a click).
     */
    async installMicroPython (source, onProgress = () => {}) {
        if (!this.transport || this.kind !== 'usb') {
            if (!supports.usb()) throw new Error('Installing needs Chrome or Edge on a computer.');
            const port = await navigator.serial.requestPort({filters: USB_FILTERS});
            await this.disconnect();
            const t = new SerialTransport(port);
            t.onData = text => this.handleData(text);
            t.onClose = () => {
                if (this.transport === t) {
                    this.transport = null;
                    this.setState('disconnected');
                }
            };
            await t.open();
            this.transport = t;
        }
        this.setState('connecting');
        let seen = '';
        this.rawListener = text => {
            seen += text;
            if (seen.length > 20000) seen = seen.slice(-10000);
        };
        const waitFor = async (pattern, ms, from = 0) => {
            const start = Date.now();
            while (Date.now() - start < ms) {
                const at = seen.indexOf(pattern, from);
                if (at !== -1) return at + pattern.length;
                await sleep(20);
            }
            throw new Error('The board stopped answering. Is MicroPython on it?');
        };
        const raw = async bytes => {
            // small pieces so boards with a 256-byte UART buffer keep up
            for (let i = 0; i < bytes.length; i += 128) {
                await this.transport.write(bytes.slice(i, i + 128));
                await sleep(12);
            }
        };
        const enc = new TextEncoder();
        const exec = async code => {
            const from = seen.length;
            await raw(enc.encode(code));
            await this.transport.write(Uint8Array.of(4));
            const okAt = await waitFor('OK', 5000, from);
            const endAt = await waitFor('\x04>', 8000, okAt);
            // between OK and \x04> is "<output>\x04<error>"
            const parts = seen.slice(okAt, endAt - 2).split('\x04');
            if (parts[1] && parts[1].trim()) throw new Error(parts[1].trim().split('\n').pop());
        };

        try {
            onProgress('Stopping the running program…');
            await this.transport.write(enc.encode('\r\x03\x03'));
            await sleep(400);
            await this.transport.write(Uint8Array.of(1)); // raw REPL
            await waitFor('raw REPL; CTRL-B to exit', 3000);
            await waitFor('>', 1000, seen.lastIndexOf('raw REPL'));

            await exec('f=open("main.py","w")');
            const chunkSize = 256;
            for (let i = 0; i < source.length; i += chunkSize) {
                onProgress(`Copying main.py… ${Math.round((i / source.length) * 100)}%`);
                await exec(`f.write(${JSON.stringify(source.slice(i, i + chunkSize))})`);
            }
            await exec('f.close()');
            onProgress('Restarting the board…');
            await this.transport.write(Uint8Array.of(2)); // back to the normal REPL
            await sleep(100);
            await this.transport.write(Uint8Array.of(4)); // soft reset, which runs main.py
            this.rawListener = null;
            this.info = await this.hello();
            this.setState('connected');
            onProgress('Installed! The board is connected.');
        } catch (e) {
            this.rawListener = null;
            await this.disconnect(e.message);
            throw e;
        }
    }
}

export const board = new Board();

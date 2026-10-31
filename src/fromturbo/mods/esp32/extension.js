// The "ESP32" blocks. Registered as a built-in extension (id ftesp32) by the ESP32 mod,
// so projects that use them load like any other built-in extension.

import ScratchCommon from 'scratch-vm/src/extension-support/tw-extension-api-common';
import {board} from './connection';

const {BlockType, ArgumentType, Cast} = ScratchCommon;

export const EXTENSION_ID = 'ftesp32';

const CHIP_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
    '<rect x="9" y="9" width="22" height="22" rx="3" fill="#fff" stroke="#b3241d" stroke-width="2"/>' +
    '<rect x="14" y="14" width="12" height="12" rx="1.5" fill="#e7352c"/>' +
    '<g stroke="#fff" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M15 4v5M20 4v5M25 4v5M15 31v5M20 31v5M25 31v5M4 15h5M4 20h5M4 25h5M31 15h5M31 20h5M31 25h5"/></g>' +
    '<g stroke="#b3241d" stroke-width="1.2" stroke-linecap="round">' +
    '<path d="M15 4v5M20 4v5M25 4v5M15 31v5M20 31v5M25 31v5M4 15h5M4 20h5M4 25h5M31 15h5M31 20h5M31 25h5"/></g>' +
    '</svg>'
)}`;

const CONNECT_WAIT = 60000;

const hooks = {
    openPanel: () => {},
    toast: () => {}
};
/** The mod tells the blocks how to open its panel and show toasts. */
export const setHooks = h => Object.assign(hooks, h);

const toPin = value => {
    const n = Math.round(Cast.toNumber(value));
    return n >= 0 && n <= 48 ? n : null;
};
const toState = value => (Cast.toBoolean(value) && Cast.toString(value) !== 'off' ? 1 : 0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

let lastNag = 0;
const nag = () => {
    if (Date.now() - lastNag < 10000) return;
    lastNag = Date.now();
    hooks.toast('The ESP32 isn\'t connected — click "Connect & set up ESP32" in its blocks.');
};

class Esp32Blocks {
    constructor (runtime) {
        this.runtime = runtime;
        this.latestMessage = '';
        board.on('message', text => {
            this.latestMessage = text;
            this.runtime.startHats(`${EXTENSION_ID}_whenAnyMessage`);
            this.runtime.startHats(`${EXTENSION_ID}_whenMessage`);
        });
    }

    getInfo () {
        const pin = def => ({type: ArgumentType.NUMBER, defaultValue: def});
        return {
            id: EXTENSION_ID,
            name: 'ESP32',
            color1: '#e7352c',
            color2: '#c92a22',
            color3: '#a3221b',
            blockIconURI: CHIP_ICON,
            menuIconURI: CHIP_ICON,
            blocks: [
                {
                    func: 'openSetup',
                    blockType: BlockType.BUTTON,
                    text: 'Connect & set up ESP32'
                },
                {
                    opcode: 'connect',
                    blockType: BlockType.COMMAND,
                    text: 'connect to ESP32 over [TRANSPORT]',
                    arguments: {TRANSPORT: {type: ArgumentType.STRING, menu: 'transport', defaultValue: 'usb'}}
                },
                {
                    opcode: 'disconnect',
                    blockType: BlockType.COMMAND,
                    text: 'disconnect ESP32'
                },
                {
                    opcode: 'isConnected',
                    blockType: BlockType.BOOLEAN,
                    text: 'ESP32 connected?'
                },
                '---',
                {
                    opcode: 'setPin',
                    blockType: BlockType.COMMAND,
                    text: 'turn pin [PIN] [STATE]',
                    arguments: {PIN: pin(2), STATE: {type: ArgumentType.STRING, menu: 'state', defaultValue: '1'}}
                },
                {
                    opcode: 'setLED',
                    blockType: BlockType.COMMAND,
                    text: 'turn built-in LED [STATE]',
                    arguments: {STATE: {type: ArgumentType.STRING, menu: 'state', defaultValue: '1'}}
                },
                {
                    opcode: 'setBrightness',
                    blockType: BlockType.COMMAND,
                    text: 'set pin [PIN] brightness to [PERCENT] %',
                    arguments: {PIN: pin(2), PERCENT: {type: ArgumentType.NUMBER, defaultValue: 50}}
                },
                {
                    opcode: 'setServo',
                    blockType: BlockType.COMMAND,
                    text: 'point servo on pin [PIN] to [ANGLE] degrees',
                    arguments: {PIN: pin(18), ANGLE: {type: ArgumentType.ANGLE, defaultValue: 90}}
                },
                {
                    opcode: 'setMode',
                    blockType: BlockType.COMMAND,
                    text: 'set pin [PIN] to [MODE]',
                    arguments: {PIN: pin(4), MODE: {type: ArgumentType.STRING, menu: 'mode', defaultValue: '3'}}
                },
                '---',
                {
                    opcode: 'whenPin',
                    blockType: BlockType.HAT,
                    text: 'when pin [PIN] turns [STATE]',
                    arguments: {PIN: pin(4), STATE: {type: ArgumentType.STRING, menu: 'state', defaultValue: '0'}}
                },
                {
                    opcode: 'isPinOn',
                    blockType: BlockType.BOOLEAN,
                    text: 'pin [PIN] is on?',
                    arguments: {PIN: pin(4)}
                },
                {
                    opcode: 'analogValue',
                    blockType: BlockType.REPORTER,
                    text: 'analog value of pin [PIN]',
                    arguments: {PIN: pin(34)}
                },
                {
                    opcode: 'touchValue',
                    blockType: BlockType.REPORTER,
                    text: 'touch value of pin [PIN]',
                    arguments: {PIN: pin(4)}
                },
                '---',
                {
                    opcode: 'sendText',
                    blockType: BlockType.COMMAND,
                    text: 'send [TEXT] to ESP32',
                    arguments: {TEXT: {type: ArgumentType.STRING, defaultValue: 'ping'}}
                },
                {
                    opcode: 'whenAnyMessage',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    text: 'when ESP32 sends a message'
                },
                {
                    opcode: 'whenMessage',
                    blockType: BlockType.HAT,
                    isEdgeActivated: false,
                    text: 'when ESP32 sends [TEXT]',
                    arguments: {TEXT: {type: ArgumentType.STRING, defaultValue: 'pong'}}
                },
                {
                    opcode: 'lastMessage',
                    blockType: BlockType.REPORTER,
                    text: 'message from ESP32'
                }
            ],
            menus: {
                transport: {
                    acceptReporters: false,
                    items: [{text: 'USB', value: 'usb'}, {text: 'Bluetooth', value: 'bluetooth'}]
                },
                state: {
                    acceptReporters: true,
                    items: [{text: 'on', value: '1'}, {text: 'off', value: '0'}]
                },
                mode: {
                    acceptReporters: false,
                    items: [
                        {text: 'output', value: '1'},
                        {text: 'input', value: '2'},
                        {text: 'input with pull-up (buttons)', value: '3'}
                    ]
                }
            }
        };
    }

    openSetup () {
        hooks.openPanel();
    }

    async connect ({TRANSPORT}) {
        if (board.connected) return;
        const bluetooth = Cast.toString(TRANSPORT) === 'bluetooth';
        try {
            // A board picked before can come back without asking.
            const quiet = bluetooth ? await board.reconnectBluetooth() : await board.reconnectUSB();
            if (quiet && board.connected) return;
        } catch (e) {
            // fall through to asking
        }
        // Browsers only show the device chooser after a click, so the panel asks.
        hooks.openPanel();
        const start = Date.now();
        while (!board.connected && Date.now() - start < CONNECT_WAIT) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    disconnect () {
        return board.disconnect();
    }

    isConnected () {
        return board.connected;
    }

    send (line) {
        if (!board.connected) {
            nag();
            return;
        }
        return board.command(line);
    }

    setPin ({PIN, STATE}) {
        const p = toPin(PIN);
        if (p !== null) return this.send(`D ${p} ${toState(STATE)}`);
    }

    setLED ({STATE}) {
        return this.send(`L ${toState(STATE)}`);
    }

    setBrightness ({PIN, PERCENT}) {
        const p = toPin(PIN);
        const duty = Math.round(clamp(Cast.toNumber(PERCENT), 0, 100) * 2.55);
        if (p !== null) return this.send(`P ${p} ${duty}`);
    }

    setServo ({PIN, ANGLE}) {
        const p = toPin(PIN);
        const angle = Math.round(clamp(Cast.toNumber(ANGLE), 0, 180));
        if (p !== null) return this.send(`S ${p} ${angle}`);
    }

    setMode ({PIN, MODE}) {
        const p = toPin(PIN);
        const mode = clamp(Math.round(Cast.toNumber(MODE)), 1, 3);
        if (p !== null) return this.send(`M ${p} ${mode}`);
    }

    whenPin ({PIN, STATE}) {
        const p = toPin(PIN);
        if (p === null || !board.connected) return false;
        board.watch(p);
        const value = board.pinValues.get(p);
        return typeof value !== 'undefined' && value === toState(STATE);
    }

    async read (cmd, PIN, fallback) {
        const p = toPin(PIN);
        if (p === null) return fallback;
        if (!board.connected) {
            nag();
            return fallback;
        }
        const value = await board.request(cmd, p);
        return value === null ? fallback : value;
    }

    async isPinOn ({PIN}) {
        const p = toPin(PIN);
        // A watched pin is already known; no need to ask the board.
        if (p !== null && board.connected && board.pinValues.has(p)) return board.pinValues.get(p) === 1;
        return (await this.read('R', PIN, 0)) === 1;
    }

    analogValue ({PIN}) {
        return this.read('A', PIN, 0);
    }

    touchValue ({PIN}) {
        return this.read('T', PIN, -1);
    }

    sendText ({TEXT}) {
        const text = Cast.toString(TEXT).replace(/[\r\n]+/g, ' ')
            .slice(0, 200);
        return this.send(`X ${text}`);
    }

    whenAnyMessage () {
        return true;
    }

    whenMessage ({TEXT}) {
        return Cast.compare(this.latestMessage, TEXT) === 0;
    }

    lastMessage () {
        return this.latestMessage;
    }
}

export default Esp32Blocks;

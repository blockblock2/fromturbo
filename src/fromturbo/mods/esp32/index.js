// ESP32 — lets projects talk to an ESP32 board over USB or Bluetooth.
// Adds the "ESP32" extension (blocks), a panel for connecting and setting up the board,
// and firmware for Arduino and MicroPython.

import Esp32Blocks, {EXTENSION_ID, setHooks} from './extension';
import {board, supports} from './connection';
import arduinoSketch from '!raw-loader!./firmware/fromturbo-esp32.ino';
import microPythonMain from '!raw-loader!./firmware/main.py';

const MICROPYTHON_DOWNLOAD = 'https://micropython.org/download/?mcu=esp32';

const download = (text, filename) => {
    const url = URL.createObjectURL(new Blob([text], {type: 'text/plain'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const PANEL_CSS = `
.ft-esp-status { display: flex; align-items: center; gap: 8px; font-weight: bold; }
.ft-esp-dot { width: 10px; height: 10px; border-radius: 50%; background: #9aa0b4; flex: none; }
.ft-esp-dot[data-state=connecting] { background: #ffb400; }
.ft-esp-dot[data-state=connected] { background: #2dbd6e; }
.ft-esp-error { color: #e7352c; font-size: 12px; }
.ft-esp-h { font-weight: bold; margin-top: 4px; }
.ft-esp-panel details summary { cursor: pointer; font-size: 12px; opacity: .8; }
.ft-esp-panel a { color: var(--looks-secondary, #4c97ff); }
.ft-esp-link { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; cursor: pointer;
    color: var(--looks-secondary, #4c97ff); text-decoration: underline; text-align: left; }
`;

export default {
    id: 'esp32',
    name: 'ESP32',
    description: 'Blocks for ESP32 boards — pins, LEDs, servos, sensors and messages over USB or Bluetooth.',
    author: 'blockblock2',
    builtIn: true,
    extensionId: EXTENSION_ID,
    run (api) {
        const {h} = api.ui;
        const vm = api.vm;
        const em = vm.extensionManager;
        api.addStyle(PANEL_CSS);

        // Makes "ftesp32" a built-in extension id: the library card, saved projects
        // and the embed player all load it the same way as Pen or Music.
        em.builtinExtensions[EXTENSION_ID] = () => Esp32Blocks;
        api.onCleanup(() => {
            delete em.builtinExtensions[EXTENSION_ID];
            board.disconnect();
        });

        const addBlocks = async () => {
            if (!em.isExtensionLoaded(EXTENSION_ID)) await vm.extensionManager.loadExtensionURL(EXTENSION_ID);
        };

        const open = () => api.ui.openPanel({
            id: 'fromturbo-esp32',
            title: 'ESP32',
            width: 400,
            render (body) {
                body.classList.add('ft-esp-panel');
                const dot = h('span', {className: 'ft-esp-dot'});
                const statusText = h('span');
                const error = h('div', {className: 'ft-esp-error', hidden: true});
                const progress = h('div', {className: 'ft-muted'});
                const log = h('pre', {className: 'ft-pre'});

                const run = async (button, fn) => {
                    button.disabled = true;
                    error.hidden = true;
                    try {
                        await fn();
                    } catch (e) {
                        // Closing the chooser isn't an error worth showing.
                        if (e && e.name !== 'NotFoundError') {
                            error.textContent = e.message || String(e);
                            error.hidden = false;
                        }
                    } finally {
                        button.disabled = false;
                        draw();
                    }
                };

                const usbBtn = h('button', {className: 'ft-btn'}, 'Connect USB');
                usbBtn.addEventListener('click', () => run(usbBtn, () => board.pickUSB()));
                const bleBtn = h('button', {className: 'ft-btn'}, 'Connect Bluetooth');
                bleBtn.addEventListener('click', () => run(bleBtn, () => board.pickBluetooth()));
                const offBtn = h('button', {className: 'ft-btn ft-quiet'}, 'Disconnect');
                offBtn.addEventListener('click', () => run(offBtn, () => board.disconnect()));
                const allPorts = h('button', {className: 'ft-esp-link'}, 'Board not in the USB list? Show every port');
                allPorts.addEventListener('click', () => run(allPorts, () => board.pickUSB({all: true})));

                const addBtn = h('button', {className: 'ft-btn ft-quiet'}, 'Add ESP32 blocks to this project');
                addBtn.addEventListener('click', () => run(addBtn, addBlocks));

                const installBtn = h('button', {className: 'ft-btn'}, 'Install to board');
                installBtn.addEventListener('click', () => run(installBtn, async () => {
                    progress.textContent = 'Pick your board\'s USB port…';
                    try {
                        await board.installMicroPython(microPythonMain, text => {
                            progress.textContent = text;
                        });
                    } catch (e) {
                        progress.textContent = '';
                        throw e;
                    }
                }));
                const sketchBtn = h('button', {className: 'ft-btn ft-quiet'}, 'Download Arduino sketch');
                sketchBtn.addEventListener('click', () => {
                    download(arduinoSketch, 'fromturbo-esp32.ino');
                });
                const pyBtn = h('button', {className: 'ft-btn ft-quiet'}, 'Download main.py');
                pyBtn.addEventListener('click', () => download(microPythonMain, 'main.py'));

                const noSupport = !supports.usb() && !supports.bluetooth();

                const draw = () => {
                    const s = board.state;
                    dot.dataset.state = s;
                    statusText.textContent = s === 'connected' ?
                        `Connected over ${board.kind === 'usb' ? 'USB' : 'Bluetooth'}` :
                        (s === 'connecting' ? 'Connecting…' : 'Not connected');
                    if (s === 'disconnected' && board.lastError) {
                        error.textContent = board.lastError;
                        error.hidden = false;
                    }
                    usbBtn.hidden = s === 'connected' || !supports.usb();
                    allPorts.hidden = usbBtn.hidden;
                    bleBtn.hidden = s === 'connected' || !supports.bluetooth();
                    offBtn.hidden = s === 'disconnected';
                    addBtn.hidden = em.isExtensionLoaded(EXTENSION_ID);
                    installBtn.disabled = s === 'connecting' || !supports.usb();
                    log.textContent = board.log.slice(-14).join('\n') || 'Nothing yet.';
                };

                body.append(
                    h('div', {className: 'ft-esp-status'}, dot, statusText),
                    noSupport ? h('div', {className: 'ft-esp-error'},
                        'This browser can\'t reach USB or Bluetooth devices. Open fromturbo.pages.dev in Chrome or Edge on a computer.') : null,
                    h('div', {className: 'ft-row'}, usbBtn, bleBtn, offBtn),
                    allPorts,
                    error,
                    addBtn,
                    h('div', {className: 'ft-esp-h'}, 'Set up your board (once)'),
                    h('div', {className: 'ft-muted'},
                        'MicroPython: if your board has ',
                        h('a', {href: MICROPYTHON_DOWNLOAD, target: '_blank', rel: 'noopener'}, 'MicroPython'),
                        ' on it, fromturbo can copy its program over USB for you.'),
                    h('div', {className: 'ft-row'}, installBtn, pyBtn),
                    progress,
                    h('div', {className: 'ft-muted'},
                        'Arduino IDE: install "esp32 by Espressif" in Boards Manager, then upload this sketch.'),
                    h('div', {className: 'ft-row'}, sketchBtn),
                    h('details', {},
                        h('summary', {}, 'What the board is saying'),
                        log)
                );
                draw();
                const offs = [board.on('status', draw), board.on('log', draw), api.on('targetsUpdate', draw)];
                return () => offs.forEach(off => off());
            }
        });

        setHooks({openPanel: open, toast: msg => api.ui.toast(msg, 5000)});
        api.onCleanup(() => setHooks({openPanel: () => {}, toast: () => {}}));

        // The "ESP32" menu-bar button only shows while the project uses the blocks.
        let removeButton = null;
        const syncButton = () => {
            const loaded = em.isExtensionLoaded(EXTENSION_ID);
            if (loaded && !removeButton) {
                removeButton = api.ui.addMenuButton('ESP32', open, {title: 'Connect and set up your ESP32'});
            } else if (!loaded && removeButton) {
                removeButton();
                removeButton = null;
            }
        };
        const onExtensionAdded = () => syncButton();
        vm.runtime.on('EXTENSION_ADDED', onExtensionAdded);
        api.onCleanup(() => vm.runtime.off('EXTENSION_ADDED', onExtensionAdded));
        api.on('projectLoaded', syncButton);
        api.on('targetsUpdate', syncButton);
        syncButton();
    }
};

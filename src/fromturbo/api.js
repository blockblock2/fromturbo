/**
 * fromturbo Mod API
 *
 * Everything a mod needs lives on `window.fromturbo`. Mods are plain JavaScript:
 *
 *   fromturbo.mods.register({
 *       id: 'my-mod',
 *       name: 'My Mod',
 *       run (api) {
 *           api.ui.addMenuButton('Hello', () => api.ui.toast('Hi!'));
 *       }
 *   });
 *
 * Licensed GPL-3.0, like the TurboWarp code it is built on.
 */

import ScratchBlocksLoader from '../lib/tw-lazy-scratch-blocks';
import ScratchCommon from 'scratch-vm/src/extension-support/tw-extension-api-common';
import {mountStyles, addMenuButton, openPanel, toast, h} from './ui';

const VERSION = '1.0.0';
const MOD_STATE_KEY = 'fromturbo.mods.enabled';
const MOD_URLS_KEY = 'fromturbo.mods.urls';

const safeGet = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
};
const safeSet = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // storage blocked (private window etc.) — settings just won't persist
    }
};

const listeners = new Map();
const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
};
const emit = (event, ...args) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set) {
        try {
            fn(...args);
        } catch (e) {
            console.error(`[fromturbo] listener for "${event}" failed`, e);
        }
    }
};

// ---------- project helpers ----------

const getVM = () => window.vm;
const getRedux = () => window.ReduxStore;
const getBlocks = () => (ScratchBlocksLoader.isLoaded() ? ScratchBlocksLoader.get() : null);
const getWorkspace = () => {
    const SB = getBlocks();
    return SB ? SB.getMainWorkspace() : null;
};

const activateTab = index => {
    const redux = getRedux();
    if (redux) redux.dispatch({type: 'scratch-gui/navigation/ACTIVATE_TAB', activeTabIndex: index});
};

const waitFor = (check, timeout = 15000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
        const value = check();
        if (value) return resolve(value);
        if (Date.now() - start > timeout) return reject(new Error('Timed out'));
        setTimeout(tick, 50);
    };
    tick();
});

const project = {
    /** Project as plain JSON (no asset files). */
    getJSON () {
        return JSON.parse(getVM().toJSON());
    },
    /** Full project as a .sb3 Blob, assets included. */
    getSb3 () {
        return getVM().saveProjectSb3();
    },
    /** Load a project from an ArrayBuffer, Blob, or project JSON object. */
    async load (data, title) {
        let input = data;
        if (data instanceof Blob) input = await data.arrayBuffer();
        else if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
            input = JSON.stringify(data);
        }
        await getVM().loadProject(input);
        if (title) project.setTitle(title);
        emit('projectLoaded');
    },
    getTitle () {
        const redux = getRedux();
        return redux ? redux.getState().scratchGui.projectTitle : '';
    },
    setTitle (title) {
        const redux = getRedux();
        if (redux) redux.dispatch({type: 'projectTitle/SET_PROJECT_TITLE', title});
    },
    /** The sprite (or stage) currently selected in the editor. */
    editingTarget () {
        return getVM().editingTarget;
    },
    /**
     * Add blocks to the selected sprite from Scratch Blocks XML
     * (`<xml><block type="event_whenflagclicked">…</block></xml>`).
     * Unknown block types are rejected so a bad script can't corrupt the project.
     * Returns the number of top-level scripts added.
     */
    async addBlocksXML (xmlText) {
        activateTab(0); // the code tab has to be open for blocks to land
        const SB = await waitFor(getBlocks);
        const ws = await waitFor(getWorkspace);
        const dom = SB.Xml.textToDom(xmlText.trim());
        const unknown = [...dom.querySelectorAll('block, shadow')]
            .map(el => el.getAttribute('type'))
            .filter(type => !SB.Blocks[type]);
        if (unknown.length) {
            throw new Error(`Unknown block types: ${[...new Set(unknown)].join(', ')}`);
        }
        // Stack new scripts below whatever is already in the sprite.
        const existing = ws.getTopBlocks(false);
        let y = 40;
        for (const b of existing) {
            const xy = b.getRelativeToSurfaceXY();
            const hw = b.getHeightWidth();
            y = Math.max(y, xy.y + hw.height + 40);
        }
        let offset = 0;
        const tops = [...dom.children].filter(el => el.tagName.toLowerCase() === 'block');
        for (const el of tops) {
            el.setAttribute('x', '40');
            el.setAttribute('y', String(y + offset));
            offset += 160;
        }
        SB.Xml.appendDomToWorkspace(dom, ws);
        emit('blocksAdded', tops.length);
        return tops.length;
    }
};

// ---------- custom extensions ----------

const extensions = {
    /**
     * Load a TurboWarp-style custom extension from a URL (or data: URL).
     * Same format as https://extensions.turbowarp.org, so existing extensions just work.
     */
    load (url) {
        return getVM().extensionManager.loadExtensionURL(url);
    },
    /**
     * The same `Scratch` object TurboWarp gives unsandboxed extensions
     * (Scratch.BlockType, Scratch.ArgumentType, Scratch.Cast, Scratch.vm …).
     */
    scratchAPI () {
        const vm = getVM();
        return Object.assign({}, ScratchCommon, {
            vm,
            renderer: vm.runtime.renderer,
            extensions: {unsandboxed: true, register: () => {}}
        });
    },
    /**
     * Add an extension written right inside a mod — no separate file or URL.
     * Pass a class (it's constructed with the Scratch object) or an instance with getInfo().
     * Returns the extension id.
     */
    define (ExtensionClassOrInstance) {
        const em = getVM().extensionManager;
        const instance = typeof ExtensionClassOrInstance === 'function' ?
            new ExtensionClassOrInstance(extensions.scratchAPI()) :
            ExtensionClassOrInstance;
        const info = instance.getInfo();
        if (em.isExtensionLoaded(info.id)) return info.id;
        const serviceName = em._registerInternalExtension(instance);
        em._loadedExtensions.set(info.id, serviceName);
        return info.id;
    },
    loaded () {
        return [...getVM().extensionManager._loadedExtensions.keys()];
    }
};

// ---------- mods ----------

const registry = new Map(); // id -> {def, running, cleanup, source}
let started = false;

const isEnabled = def => {
    const state = safeGet(MOD_STATE_KEY, {});
    if (Object.prototype.hasOwnProperty.call(state, def.id)) return state[def.id];
    return def.enabledByDefault !== false;
};

const storageFor = id => ({
    get (key, fallback) {
        return safeGet(`fromturbo.mod.${id}.${key}`, fallback);
    },
    set (key, value) {
        safeSet(`fromturbo.mod.${id}.${key}`, value);
    }
});

const runMod = entry => {
    if (entry.running) return;
    try {
        const result = entry.def.run(api, {storage: storageFor(entry.def.id)});
        entry.cleanup = typeof result === 'function' ? result : null;
        entry.running = true;
        emit('modStarted', entry.def.id);
    } catch (e) {
        console.error(`[fromturbo] mod "${entry.def.id}" crashed`, e);
        toast(`Mod "${entry.def.name || entry.def.id}" crashed — see console`);
    }
};

const mods = {
    /** Add a mod. Built-ins and URL mods both come through here. */
    register (def) {
        if (!def || !def.id || typeof def.run !== 'function') {
            throw new Error('fromturbo.mods.register needs {id, run(api)}');
        }
        const entry = {def, running: false, cleanup: null, source: mods._currentSource || 'inline'};
        registry.set(def.id, entry);
        emit('modRegistered', def.id);
        if (started && isEnabled(def)) runMod(entry);
        return def.id;
    },
    list () {
        return [...registry.values()].map(e => ({
            id: e.def.id,
            name: e.def.name || e.def.id,
            description: e.def.description || '',
            author: e.def.author || '',
            builtIn: !!e.def.builtIn,
            source: e.source,
            enabled: isEnabled(e.def),
            running: e.running
        }));
    },
    setEnabled (id, enabled) {
        const state = safeGet(MOD_STATE_KEY, {});
        state[id] = enabled;
        safeSet(MOD_STATE_KEY, state);
        const entry = registry.get(id);
        if (!entry) return 'missing';
        if (enabled) {
            runMod(entry);
            return 'started';
        }
        if (entry.running && entry.cleanup) {
            try {
                entry.cleanup();
            } catch (e) {
                console.error(e);
            }
            entry.running = false;
            return 'stopped';
        }
        return entry.running ? 'reload' : 'stopped';
    },
    /** URLs of mods the user installed. */
    urls () {
        return safeGet(MOD_URLS_KEY, []);
    },
    /** Load a mod script from a URL. `remember` keeps it installed across visits. */
    loadURL (url, {remember = true} = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = true;
            script.onload = () => {
                if (remember) {
                    const list = mods.urls();
                    if (!list.includes(url)) safeSet(MOD_URLS_KEY, [...list, url]);
                }
                resolve();
            };
            script.onerror = () => reject(new Error(`Couldn't load mod from ${url}`));
            mods._currentSource = url;
            document.head.appendChild(script);
        }).finally(() => {
            mods._currentSource = null;
        });
    },
    removeURL (url) {
        safeSet(MOD_URLS_KEY, mods.urls().filter(u => u !== url));
        for (const [id, e] of registry) {
            if (e.source === url) mods.setEnabled(id, false);
        }
    },
    _currentSource: null
};

// ---------- public object ----------

const api = {
    name: 'fromturbo',
    version: VERSION,
    get vm () {
        return getVM();
    },
    get redux () {
        return getRedux();
    },
    /** ScratchBlocks (Blockly), once the code tab has loaded it. null before that. */
    get blocks () {
        return getBlocks();
    },
    get workspace () {
        return getWorkspace();
    },
    on,
    emit,
    waitFor,
    ui: {addMenuButton, openPanel, toast, h, activateTab},
    project,
    extensions,
    mods,
    storage: storageFor
};

/** Wire up VM events, then start every enabled mod. */
const start = () => {
    if (started) return;
    mountStyles();
    const vm = getVM();
    vm.on('PROJECT_CHANGED', () => emit('projectChanged'));
    vm.on('targetsUpdate', () => emit('targetsUpdate'));
    vm.runtime.on('PROJECT_START', () => emit('greenFlag'));
    vm.runtime.on('PROJECT_RUN_STOP', () => emit('stop'));
    vm.on('workspaceUpdate', () => emit('workspaceUpdate'));
    started = true;
    for (const entry of registry.values()) {
        if (isEnabled(entry.def)) runMod(entry);
    }
    emit('ready', api);
};

export {api, start, waitFor};

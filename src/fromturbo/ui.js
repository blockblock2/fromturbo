// Small DOM helpers for mods. Uses TurboWarp's theme variables so mods
// follow light/dark mode and the user's accent colour automatically.

const CSS = `
.ft-menu-btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 100%; padding: 0 0.75rem; cursor: pointer;
    color: inherit; font: inherit; background: none; border: 0;
    white-space: nowrap;
}
.ft-menu-btn:hover { background: hsla(0, 0%, 0%, 0.15); }
.ft-menu-btn .ft-dot { width: 8px; height: 8px; border-radius: 50%; background: #ffd75e; }
@media only screen and (max-width: 1440px) {
    .ft-menu-btn { padding: 0 0.45rem; gap: 4px; }
    .ft-menu-btn .ft-dot { width: 6px; height: 6px; }
}

.ft-panel {
    position: fixed; z-index: 10000; top: 64px; right: 16px;
    width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 96px);
    display: flex; flex-direction: column;
    background: var(--ui-modal-background, #fff);
    color: var(--text-primary, #575e75);
    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,.15));
    border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.28);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 14px;
}
.ft-panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-radius: 10px 10px 0 0;
    background: var(--menu-bar-background, #855cd6); color: #fff; font-weight: bold;
    cursor: move; user-select: none;
}
.ft-panel-head button { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
.ft-panel-body { padding: 14px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.ft-panel textarea, .ft-panel input[type=text], .ft-panel input[type=url] {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px;
    border: 1px solid var(--ui-black-transparent, rgba(0,0,0,.2));
    background: var(--ui-primary, #fff); color: inherit; font: inherit;
}
.ft-panel textarea { min-height: 90px; resize: vertical; }
.ft-btn {
    padding: 8px 14px; border-radius: 6px; border: 0; cursor: pointer; font: inherit; font-weight: bold;
    background: var(--looks-secondary, #855cd6); color: #fff;
}
.ft-btn:disabled { opacity: .5; cursor: default; }
.ft-btn.ft-quiet { background: var(--ui-tertiary, #e9eef2); color: inherit; }
.ft-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ft-muted { opacity: .7; font-size: 12px; }
.ft-pre {
    max-height: 200px; overflow: auto; margin: 0; padding: 8px; border-radius: 6px;
    background: var(--ui-tertiary, #f2f2f2); font: 11px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap;
}
.ft-list { display: flex; flex-direction: column; gap: 6px; }
.ft-item {
    display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px;
    background: var(--ui-tertiary, #f4f4f8);
}
.ft-item-main { flex: 1; min-width: 0; }
.ft-item-title { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ft-toast {
    position: fixed; z-index: 10001; left: 50%; bottom: 24px; transform: translateX(-50%);
    padding: 10px 16px; border-radius: 8px; background: #1f1f2e; color: #fff;
    font: 14px "Helvetica Neue", Helvetica, Arial, sans-serif; box-shadow: 0 6px 20px rgba(0,0,0,.3);
    max-width: calc(100vw - 32px);
}
`;

let stylesMounted = false;
const mountStyles = () => {
    if (stylesMounted) return;
    const style = document.createElement('style');
    style.id = 'fromturbo-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
    stylesMounted = true;
};

/**
 * Tiny element builder: h('button', {className: 'ft-btn', onclick}, 'Go')
 */
const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
        if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key in el) el[key] = value;
        else el.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child === null || child === false || typeof child === 'undefined') continue;
        el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
};

let toastTimer = null;
const toast = (message, ms = 3500) => {
    mountStyles();
    let el = document.querySelector('.ft-toast');
    if (!el) {
        el = h('div', {className: 'ft-toast', role: 'status'});
        document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), ms);
};

// Menu bar buttons go in a strip right after TurboWarp's own menus.
const pendingButtons = [];
const findMenuStrip = () => {
    let strip = document.getElementById('fromturbo-menu');
    if (strip) return strip;
    const menu = document.querySelector('[class*="menu-bar_main-menu"]');
    if (!menu) return null;
    strip = h('div', {id: 'fromturbo-menu', style: {display: 'flex', alignSelf: 'stretch'}});
    menu.appendChild(strip);
    return strip;
};
const flushButtons = () => {
    const strip = findMenuStrip();
    if (!strip) return false;
    while (pendingButtons.length) strip.appendChild(pendingButtons.shift());
    return true;
};
const allButtons = [];
// The menu bar can re-render (e.g. switching to player mode), so keep re-attaching.
const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
    const strip = document.getElementById('fromturbo-menu');
    if (!strip && allButtons.length) {
        pendingButtons.push(...allButtons);
        flushButtons();
    }
});

/** Add a button to the editor's top menu bar. Returns a function that removes it. */
const addMenuButton = (label, onClick, {title} = {}) => {
    mountStyles();
    const btn = h('button', {className: 'ft-menu-btn', onclick: onClick, title: title || label},
        h('span', {className: 'ft-dot'}), label);
    allButtons.push(btn);
    pendingButtons.push(btn);
    if (!flushButtons()) {
        const wait = setInterval(() => flushButtons() && clearInterval(wait), 200);
    }
    if (observer && allButtons.length === 1) observer.observe(document.body, {childList: true, subtree: true});
    return () => {
        btn.remove();
        allButtons.splice(allButtons.indexOf(btn), 1);
    };
};

const openPanels = new Map();
/**
 * Open a floating, draggable panel. `render(body, panel)` fills it.
 * Opening a panel with the same id again just brings it back to front.
 */
const openPanel = ({id, title, render, width}) => {
    mountStyles();
    if (id && openPanels.has(id)) {
        const existing = openPanels.get(id);
        document.body.appendChild(existing.el);
        return existing;
    }
    const body = h('div', {className: 'ft-panel-body'});
    const closeBtn = h('button', {'aria-label': 'Close', 'title': 'Close'}, '×');
    const head = h('div', {className: 'ft-panel-head'}, h('span', {}, title || 'Mod'), closeBtn);
    const el = h('div', {'className': 'ft-panel', 'role': 'dialog', 'aria-label': title || 'Mod'}, head, body);
    if (width) el.style.width = `min(${width}px, calc(100vw - 32px))`;
    const panel = {
        el,
        body,
        close () {
            el.remove();
            if (id) openPanels.delete(id);
            if (panel.onClose) panel.onClose();
        },
        onClose: null
    };
    closeBtn.addEventListener('click', panel.close);
    // drag by the header
    head.addEventListener('pointerdown', e => {
        if (e.target === closeBtn) return;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;
        const move = ev => {
            el.style.left = `${Math.max(0, ev.clientX - dx)}px`;
            el.style.top = `${Math.max(0, ev.clientY - dy)}px`;
            el.style.right = 'auto';
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    });
    document.body.appendChild(el);
    if (id) openPanels.set(id, panel);
    render(body, panel);
    return panel;
};

export {mountStyles, h, toast, addMenuButton, openPanel};

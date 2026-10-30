// Boots fromturbo: exposes window.fromturbo, registers the built-in mods,
// loads the user's installed mods, and adds the "Mods" manager to the menu bar.

import {api, start, waitFor} from './api';
import scratchity from './mods/scratchity';
import colab from './mods/colab';
import scratchpack from './mods/scratchpack';
import {rebrandBuiltinBlocks} from './brand';
import {SECTIONS} from './sections';
import {communitySection} from './community';

const BUILT_IN = [scratchity, colab, scratchpack];
const DOCS_URL = location.protocol === 'file:' ? 'https://fromturbo.pages.dev/mods/' : 'mods/';

// Mods loaded with ?mod=URL. Running someone's mod gives it full control of the editor,
// so links from other sites always ask first.
const confirmMod = url => window.confirm(
    `Load this mod?\n\n${url}\n\nMods can do anything in the editor, including changing your project. ` +
    'Only load mods from people you trust.'
);

const openManager = () => api.ui.openPanel({
    id: 'fromturbo-mods',
    title: 'Mods',
    width: 460,
    render (body) {
        const {h} = api.ui;
        const list = h('div', {className: 'ft-list'});
        const status = h('div', {className: 'ft-muted'});
        const urlInput = h('input', {'type': 'url', 'placeholder': 'https://example.com/my-mod.js', 'aria-label': 'Mod URL'});
        const extInput = h('input', {'type': 'url', 'placeholder': 'https://example.com/extension.js', 'aria-label': 'Extension URL'});

        const draw = () => {
            list.replaceChildren(...api.mods.list().map(m => {
                const toggle = h('input', {'type': 'checkbox', 'checked': m.enabled, 'aria-label': `Turn ${m.name} on or off`});
                toggle.addEventListener('change', () => {
                    api.mods.setEnabled(m.id, toggle.checked);
                    status.textContent = `${m.name} ${toggle.checked ? 'on' : 'off'}`;
                    draw();
                });
                const remove = m.builtIn ? null : h('button', {
                    className: 'ft-btn ft-quiet',
                    onclick: () => {
                        api.mods.removeURL(m.source);
                        status.textContent = `Removed ${m.name}.`;
                        draw();
                    }
                }, 'Remove');
                return h('div', {className: 'ft-item'},
                    toggle,
                    h('div', {className: 'ft-item-main'},
                        m.builtIn ? h('div', {className: 'ft-note'}, SECTIONS.ftModApproved.note) : null,
                        h('div', {className: 'ft-item-title'}, m.name, m.builtIn ? h('span', {className: 'ft-muted'}, '  built-in') : null),
                        h('div', {className: 'ft-muted'}, m.description || m.source)),
                    remove);
            }));
        };
        const offReg = api.on('modRegistered', draw);

        const install = h('button', {
            className: 'ft-btn',
            onclick: async () => {
                const url = urlInput.value.trim();
                if (!url) return;
                status.textContent = 'Loading mod…';
                try {
                    await api.mods.loadURL(url);
                    urlInput.value = '';
                    status.textContent = 'Installed — it loads every time you open fromturbo.';
                } catch (e) {
                    status.textContent = e.message;
                }
            }
        }, 'Install');

        const addExt = h('button', {
            className: 'ft-btn',
            onclick: async () => {
                const url = extInput.value.trim();
                if (!url) return;
                status.textContent = 'Loading extension…';
                try {
                    await api.extensions.load(url);
                    extInput.value = '';
                    status.textContent = 'Extension added to this project.';
                } catch (e) {
                    status.textContent = `Couldn't load extension: ${e.message || e}`;
                }
            }
        }, 'Add');

        body.append(
            list,
            communitySection(api),
            h('div', {className: 'ft-muted'}, 'Install a mod from a URL'),
            h('div', {className: 'ft-row', style: {flexWrap: 'nowrap'}}, urlInput, install),
            h('div', {className: 'ft-muted'}, 'Add a custom extension to this project'),
            h('div', {className: 'ft-row', style: {flexWrap: 'nowrap'}}, extInput, addExt),
            status,
            h('a', {href: DOCS_URL, target: '_blank', rel: 'noopener'}, 'How to make a mod →')
        );
        draw();
        return offReg;
    }
});

const boot = async () => {
    window.fromturbo = api;
    for (const mod of BUILT_IN) api.mods.register(mod);

    // Rebrand built-in blocks the moment the VM exists, before any project can load them.
    await waitFor(() => window.vm, 60000);
    rebrandBuiltinBlocks(window.vm);
    await waitFor(() => window.ReduxStore, 60000);
    start();
    api.ui.addMenuButton('Mods', openManager, {title: 'Manage fromturbo mods'});

    // Mods the user installed earlier
    for (const url of api.mods.urls()) {
        api.mods.loadURL(url, {remember: false}).catch(e => console.warn('[fromturbo]', e.message));
    }
    // ?mod=URL (repeatable) — e.g. fromturbo.pages.dev/editor.html?mod=https://…/cool.js
    const params = new URLSearchParams(location.search);
    for (const url of params.getAll('mod')) {
        if (api.mods.urls().includes(url)) continue;
        if (confirmMod(url)) {
            api.mods.loadURL(url).catch(e => api.ui.toast(e.message));
        }
    }
};

boot().catch(e => console.error('[fromturbo] failed to start', e));

export default api;

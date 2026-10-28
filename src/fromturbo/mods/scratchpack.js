// .scratchpack / .scratchplay support.
// A pack is a zip with manifest.json ({format, projects: [{id, title, file, format, bytes, …}]})
// and the projects under projects/. Packs without a manifest are scanned for .sb3/.sb2 files.

import JSZip from '@turbowarp/jszip';

const ACCEPT = '.scratchpack,.scratchplay,.zip';

const pickFile = accept => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
});

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeName = s => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim()
    .slice(0, 80) || 'Untitled';
const mb = bytes => `${(bytes / 1048576).toFixed(1)} MB`;

/** Read a pack into {zip, manifest, entries}. */
const readPack = async file => {
    const zip = await JSZip.loadAsync(file);
    let manifest = null;
    const manFile = zip.file('manifest.json');
    if (manFile) {
        try {
            manifest = JSON.parse(await manFile.async('string'));
        } catch (e) {
            manifest = null;
        }
    }
    let entries;
    if (manifest && Array.isArray(manifest.projects)) {
        entries = manifest.projects.filter(p => p.file && zip.file(p.file));
    } else {
        entries = Object.keys(zip.files)
            .filter(n => /\.sb[23]$/i.test(n) && !zip.files[n].dir)
            .map(n => ({id: n,
                title: n.split('/').pop()
                    .replace(/\.sb[23]$/i, ''),
                file: n}));
        manifest = null;
    }
    return {zip, manifest, entries};
};

/** Add the open project to `pack` (or a new one) and return the new pack Blob. */
const buildPack = async (api, existing) => {
    const zip = existing ? existing.zip : new JSZip();
    const manifest = existing && existing.manifest ? existing.manifest : {
        format: 'scratchpack',
        version: 1,
        created: new Date().toISOString(),
        source: {site: 'fromturbo.pages.dev'},
        projects: []
    };
    if (existing && !existing.manifest) {
        // turn a bare zip into a proper pack, keeping what was already inside
        manifest.projects = existing.entries.map(e => ({...e, format: e.file.split('.').pop()}));
    }
    const sb3 = await api.project.getSb3();
    const title = api.project.getTitle() || 'Untitled';
    const id = `fromturbo-${Date.now()}`;
    const file = `projects/${id}.sb3`;
    zip.file(file, sb3);
    const projectJSON = api.project.getJSON();
    const assets = new Set();
    for (const t of projectJSON.targets) {
        for (const c of t.costumes || []) assets.add(c.md5ext);
        for (const s of t.sounds || []) assets.add(s.md5ext);
    }
    manifest.projects.push({
        id,
        title,
        file,
        format: 'sb3',
        assets: assets.size,
        bytes: sb3.size,
        modified: new Date().toISOString()
    });
    manifest.count = manifest.projects.length;
    manifest.totalAssets = manifest.projects.reduce((s, p) => s + (p.assets || 0), 0);
    manifest.updated = new Date().toISOString();
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    return zip.generateAsync({type: 'blob', compression: 'STORE'});
};

export default {
    id: 'scratchpack',
    name: '.scratchpack',
    description: 'Open games from .scratchpack/.scratchplay archives and save projects into them.',
    author: 'blockblock2',
    builtIn: true,
    run (api) {
        const {h} = api.ui;
        let current = null; // last opened pack
        let currentName = '';

        const open = () => api.ui.openPanel({
            id: 'scratchpack',
            title: '.scratchpack',
            render (body) {
                const status = h('div', {className: 'ft-muted'});
                const list = h('div', {className: 'ft-list'});
                const filter = h('input', {'type': 'text', 'placeholder': 'Search this pack', 'aria-label': 'Search', 'hidden': true});

                const renderList = () => {
                    if (!current) {
                        list.replaceChildren();
                        filter.hidden = true;
                        return;
                    }
                    filter.hidden = current.entries.length < 8;
                    const q = filter.value.trim().toLowerCase();
                    const shown = current.entries.filter(e => !q || String(e.title).toLowerCase()
                        .includes(q));
                    list.replaceChildren(...shown.map(entry => h('div', {className: 'ft-item'},
                        h('div', {className: 'ft-item-main'},
                            h('div', {className: 'ft-item-title', title: entry.title}, entry.title || entry.id),
                            entry.bytes ? h('div', {className: 'ft-muted'}, mb(entry.bytes)) : null),
                        h('button', {
                            className: 'ft-btn',
                            onclick: async () => {
                                status.textContent = `Opening ${entry.title}…`;
                                try {
                                    const buf = await current.zip.file(entry.file).async('arraybuffer');
                                    await api.project.load(buf, entry.title);
                                    status.textContent = `Opened ${entry.title}`;
                                } catch (e) {
                                    status.textContent = `Couldn't open it: ${e.message}`;
                                }
                            }
                        }, 'Open'))));
                };
                filter.addEventListener('input', renderList);

                const openBtn = h('button', {
                    className: 'ft-btn',
                    onclick: async () => {
                        const file = await pickFile(ACCEPT);
                        if (!file) return;
                        status.textContent = 'Reading pack…';
                        try {
                            current = await readPack(file);
                            currentName = file.name;
                            const who = current.manifest && current.manifest.source && current.manifest.source.user;
                            status.textContent = `${current.entries.length} project${current.entries.length === 1 ? '' : 's'}` +
                                `${who ? ` from @${who}` : ''} in ${file.name}`;
                        } catch (e) {
                            current = null;
                            status.textContent = `That doesn't look like a pack: ${e.message}`;
                        }
                        renderList();
                    }
                }, 'Open a pack');

                const saveNew = h('button', {
                    className: 'ft-btn ft-quiet',
                    onclick: async () => {
                        status.textContent = 'Packing…';
                        const blob = await buildPack(api, null);
                        downloadBlob(blob, `${safeName(api.project.getTitle())}.scratchpack`);
                        status.textContent = 'Saved a new .scratchpack';
                    }
                }, 'Save project as new pack');

                const addToOpen = h('button', {
                    className: 'ft-btn ft-quiet',
                    onclick: async () => {
                        if (!current) {
                            status.textContent = 'Open a pack first, then add to it.';
                            return;
                        }
                        status.textContent = 'Adding…';
                        const blob = await buildPack(api, current);
                        current = await readPack(blob);
                        renderList();
                        downloadBlob(blob, currentName.replace(/\.(zip)$/i, '.scratchpack') || 'pack.scratchpack');
                        status.textContent = `Added "${api.project.getTitle() || 'Untitled'}" and downloaded the updated pack`;
                    }
                }, 'Add project to open pack');

                body.append(
                    h('div', {className: 'ft-row'}, openBtn, saveNew, addToOpen),
                    status,
                    filter,
                    list
                );
                renderList();
            }
        });

        return api.ui.addMenuButton('Scratchpack', open, {title: 'Open or save .scratchpack archives'});
    }
};

export {readPack, buildPack};

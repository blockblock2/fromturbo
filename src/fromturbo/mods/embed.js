// Embed — put this project on any website.
// Saves a copy of the project online and gives you <iframe> code. The embed runs on
// embed.fromturbo.pages.dev, where any custom extensions the project uses run by themselves.

import {EMBED_SITE, MAIN_SITE} from '../embed-host';

const API = `${location.protocol === 'file:' ? MAIN_SITE : location.origin}/api/projects`;

const toBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const url = String(reader.result);
        resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Couldn\'t read the project.'));
    reader.readAsDataURL(blob);
});

const escAttr = s => String(s).replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');

/** Custom extensions the project needs (the ones that aren't built into Scratch). */
const customExtensions = api => {
    const urls = api.project.getJSON().extensionURLs || {};
    return Object.entries(urls).map(([id, url]) => ({id, url}));
};

export const embedURL = ({projectUrl, autoplay}) =>
    `${EMBED_SITE}/embed.html?project_url=${encodeURIComponent(projectUrl)}${autoplay ? '&autoplay' : ''}`;

export const iframeCode = ({src, width, height, title}) =>
    `<iframe src="${escAttr(src)}" width="${width}" height="${height}" title="${escAttr(title)}" ` +
    `allowtransparency="true" frameborder="0" scrolling="no" allowfullscreen ` +
    `allow="fullscreen; gamepad; autoplay" ` +
    `sandbox="allow-scripts allow-same-origin allow-popups allow-pointer-lock allow-downloads"></iframe>`;

export default {
    id: 'embed',
    name: 'Embed',
    description: 'Put this project on any website. Custom extensions it uses run automatically.',
    author: 'blockblock2',
    builtIn: true,
    run (api) {
        const {h} = api.ui;
        const open = () => api.ui.openPanel({
            id: 'embed',
            title: 'Embed this project',
            render (body) {
                const exts = customExtensions(api);
                const width = h('input', {'type': 'number', 'min': 200, 'max': 2000, 'value': 482, 'aria-label': 'Width'});
                const height = h('input', {'type': 'number', 'min': 150, 'max': 2000, 'value': 412, 'aria-label': 'Height'});
                const autoplay = h('input', {'type': 'checkbox', 'aria-label': 'Start automatically'});
                const status = h('div', {className: 'ft-muted'});
                const code = h('textarea', {'readOnly': true, 'hidden': true, 'aria-label': 'Embed code', 'rows': 5});
                const copy = h('button', {className: 'ft-btn', hidden: true}, 'Copy code');
                const preview = h('a', {hidden: true, target: '_blank', rel: 'noopener'}, 'Open the embed →');
                const make = h('button', {className: 'ft-btn'}, 'Create embed code');
                let saved = null; // {url} of the saved copy, so changing the size doesn't save again

                const showCode = () => {
                    const src = embedURL({projectUrl: saved.url, autoplay: autoplay.checked});
                    const w = Math.max(200, Math.min(2000, Number(width.value) || 482));
                    const hgt = Math.max(150, Math.min(2000, Number(height.value) || 412));
                    code.value = iframeCode({src, width: w, height: hgt, title: api.project.getTitle() || 'Scratch project'});
                    preview.href = src;
                    code.hidden = false;
                    copy.hidden = false;
                    preview.hidden = false;
                };
                const refresh = () => {
                    if (saved) showCode();
                };
                [width, height, autoplay].forEach(input => input.addEventListener('change', refresh));

                make.addEventListener('click', async () => {
                    make.disabled = true;
                    status.textContent = 'Saving a copy of your project…';
                    try {
                        const b64 = await toBase64(await api.project.getSb3());
                        const res = await fetch(`${API}?name=${encodeURIComponent(api.project.getTitle() || 'Project')}`, {
                            method: 'POST',
                            headers: {'Content-Type': 'text/plain'},
                            body: b64
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                        saved = data;
                        showCode();
                        status.textContent = 'Done! Paste this code into any web page.';
                        make.textContent = 'Make a new embed';
                    } catch (e) {
                        status.textContent = `Couldn't make the embed: ${e.message}`;
                    } finally {
                        make.disabled = false;
                    }
                });
                copy.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(code.value);
                    } catch (e) {
                        code.select();
                        document.execCommand('copy');
                    }
                    api.ui.toast('Embed code copied');
                });

                body.append(
                    h('div', {}, `Puts "${api.project.getTitle() || 'this project'}" on any website.`),
                    exts.length ?
                        h('div', {className: 'ft-muted'},
                            `Uses ${exts.length} custom extension${exts.length === 1 ? '' : 's'} ` +
                            `(${exts.map(e => e.id).join(', ')}). ` +
                            `${exts.length === 1 ? 'It runs' : 'They run'} automatically in the embed.`) :
                        null,
                    h('div', {className: 'ft-row'},
                        h('label', {className: 'ft-muted'}, 'Width ', width),
                        h('label', {className: 'ft-muted'}, 'Height ', height),
                        h('label', {className: 'ft-muted'}, autoplay, ' Start automatically')),
                    make,
                    status,
                    code,
                    h('div', {className: 'ft-row'}, copy, preview),
                    h('div', {className: 'ft-muted'},
                        'The embed is a copy of the project as it is now. After you change the project, make a new embed.')
                );
            }
        });
        api.ui.addMenuButton('Embed', open, {title: 'Put this project on another website'});
    }
};

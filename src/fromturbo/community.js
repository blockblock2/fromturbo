// Community mods: everyone can browse and install them from Mods.
// Uploading is exclusive to the BananaPeel DMG version of the Mac app
// (BananaPeel's window sets window.bananapeel.kind to "dmg" or "installed"),
// and needs a Scratch Auth sign-in. Mods are credited to the uploader's
// Scratch username only, never a real name.

const SITE = 'https://fromturbo.pages.dev';
const ORIGIN = location.protocol === 'file:' ? SITE : location.origin;
const API = `${ORIGIN}/api/mods`;
const AUTH = `${ORIGIN}/api/auth`;
const TOKEN_KEY = 'fromturbo.scratchAuth';

const bananaPeelKind = () => (window.bananapeel && typeof window.bananapeel === 'object' ? window.bananapeel.kind : null);
const canUpload = () => bananaPeelKind() === 'dmg';

const store = {
    get () {
        try {
            return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null;
        } catch (e) {
            return null;
        }
    },
    set (value) {
        try {
            if (value) localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) {
            // storage blocked: they'll just sign in again next time
        }
    }
};

const pickJsFile = () => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js';
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
});

const randomNonce = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Sign in with Scratch Auth. The sign-in page opens in the browser (BananaPeel sends
 * website links there); the app waits for it to finish. Resolves {username, token}.
 */
const signIn = onStatus => new Promise((resolve, reject) => {
    const nonce = randomNonce();
    window.open(`${AUTH}/start?nonce=${nonce}`, '_blank');
    onStatus('Finish signing in with Scratch in your browser…');
    const started = Date.now();
    const tick = async () => {
        if (Date.now() - started > 5 * 60 * 1000) return reject(new Error('Sign-in timed out. Press Upload to try again.'));
        try {
            const res = await fetch(`${AUTH}/poll?nonce=${nonce}`, {cache: 'no-store'});
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return reject(new Error(data.error || `HTTP ${res.status}`));
            if (data.token && data.username) {
                const session = {username: data.username, token: data.token};
                store.set(session);
                return resolve(session);
            }
        } catch (e) {
            // offline for a moment; keep waiting
        }
        setTimeout(tick, 2000);
    };
    setTimeout(tick, 2000);
});

const fetchMods = async () => {
    const res = await fetch(API, {cache: 'no-store'});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.mods || [];
};

const uploadMod = async (file, session) => {
    const code = await file.text();
    const res = await fetch(API, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}`},
        body: JSON.stringify({code, filename: file.name})
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) store.set(null);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data.mod;
};

/** The "Community mods" part of the Mods panel. */
const communitySection = api => {
    const {h} = api.ui;
    const list = h('div', {className: 'ft-list'}, h('div', {className: 'ft-muted'}, 'Loading community mods…'));
    const status = h('div', {className: 'ft-muted'});
    const who = h('div', {className: 'ft-muted'});
    const say = text => {
        status.textContent = text;
    };

    const draw = mods => {
        if (!mods.length) {
            list.replaceChildren(h('div', {className: 'ft-muted'}, 'No community mods yet.'));
            return;
        }
        const installed = new Set(api.mods.urls());
        list.replaceChildren(...mods.slice(0, 50).map(m => {
            const have = installed.has(m.url);
            const btn = h('button', {
                className: have ? 'ft-btn ft-quiet' : 'ft-btn',
                disabled: have,
                onclick: async () => {
                    btn.disabled = true;
                    btn.textContent = 'Installing…';
                    try {
                        await api.mods.loadURL(m.url);
                        btn.textContent = 'Installed';
                        btn.className = 'ft-btn ft-quiet';
                    } catch (e) {
                        btn.disabled = false;
                        btn.textContent = 'Install';
                        say(e.message);
                    }
                }
            }, have ? 'Installed' : 'Install');
            return h('div', {className: 'ft-item'},
                h('div', {className: 'ft-item-main'},
                    h('div', {className: 'ft-item-title', title: m.name}, m.name),
                    h('div', {className: 'ft-muted'},
                        [m.description, m.author ? `by @${m.author}` : ''].filter(Boolean).join(' · ') || ' ')),
                btn);
        }));
    };

    const refresh = () => fetchMods().then(draw)
        .catch(e => list.replaceChildren(h('div', {className: 'ft-muted'}, `Couldn't load community mods: ${e.message}`)));

    const showWho = () => {
        const session = store.get();
        who.replaceChildren();
        if (!session) return;
        who.append(`Uploading as @${session.username} · `,
            h('a', {
                href: '#',
                onclick: e => {
                    e.preventDefault();
                    store.set(null);
                    showWho();
                    say('Signed out.');
                }
            }, 'Sign out'));
    };

    let upload = null;
    if (canUpload()) {
        upload = h('button', {
            className: 'ft-btn',
            onclick: async () => {
                upload.disabled = true;
                try {
                    let session = store.get();
                    if (!session) {
                        session = await signIn(say);
                        showWho();
                        say(`Signed in as @${session.username}. Pick your mod.`);
                    }
                    const file = await pickJsFile();
                    if (!file) return say('');
                    say(`Uploading ${file.name}…`);
                    const mod = await uploadMod(file, session);
                    say(`Uploaded "${mod.name}". Everyone can install it from Community mods now.`);
                    api.ui.toast(`Uploaded ${mod.name} 🍌`);
                    refresh();
                } catch (e) {
                    say(e.message);
                    showWho();
                } finally {
                    upload.disabled = false;
                }
            }
        }, '🍌 Upload a mod');
        showWho();
    }

    refresh();
    return h('div', {className: 'ft-list'},
        h('div', {className: 'ft-row', style: {justifyContent: 'space-between'}},
            h('strong', {}, 'Community mods'),
            upload || h('span', {className: 'ft-muted'}, 'Upload from the fromturbo DMG app')),
        upload ? who : null,
        list,
        status);
};

export {communitySection, canUpload, API as MODS_API};

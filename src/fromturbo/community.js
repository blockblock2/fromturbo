// Community mods and extensions.
// Everyone can browse and install them (Mods panel and the extension library).
// Publishing is exclusive to the BananaPeel DMG version of the Mac app
// (BananaPeel's window sets window.bananapeel.kind to "dmg" or "installed"),
// and needs a Scratch Auth sign-in. Everything is credited to the uploader's
// Scratch username only, never a real name. Admins can approve items.

import {sectionFor} from './sections';

const SITE = 'https://fromturbo.pages.dev';
const ORIGIN = location.protocol === 'file:' ? SITE : location.origin;
const API = `${ORIGIN}/api/mods`;
const AUTH = `${ORIGIN}/api/auth`;
const TOKEN_KEY = 'fromturbo.scratchAuth';

const bananaPeelKind = () => (window.bananapeel && typeof window.bananapeel === 'object' ? window.bananapeel.kind : null);
const canPublish = () => bananaPeelKind() === 'dmg';

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
 * website links there); the app waits for it to finish. Resolves {username, token, admin}.
 */
const signIn = onStatus => new Promise((resolve, reject) => {
    const nonce = randomNonce();
    window.open(`${AUTH}/start?nonce=${nonce}`, '_blank');
    onStatus('Finish signing in with Scratch in your browser…');
    const started = Date.now();
    const tick = async () => {
        if (Date.now() - started > 5 * 60 * 1000) return reject(new Error('Sign-in timed out. Try again.'));
        try {
            const res = await fetch(`${AUTH}/poll?nonce=${nonce}`, {cache: 'no-store'});
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return reject(new Error(data.error || `HTTP ${res.status}`));
            if (data.token && data.username) {
                const session = {username: data.username, token: data.token, admin: !!data.admin};
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

/** Everything published: [{id, kind, approved, name, description, author, url, extId?}] */
const fetchItems = async () => {
    const res = await fetch(API, {cache: 'no-store'});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return (data.items || data.mods || []).map(i => ({kind: 'mod', approved: false, ...i}));
};

const authedPost = async (url, session, body) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${session.token}`},
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) store.set(null);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
};

const publishFile = async (file, kind, session) =>
    (await authedPost(API, session, {code: await file.text(), filename: file.name, kind})).item;

const setApproved = async (id, approved, session) =>
    (await authedPost(`${API}/approve`, session, {id, approved})).item;

/** Install a community item: mods are installed for good, extensions are added to the open project. */
const installItem = async (api, item) => {
    if (item.kind === 'extension') {
        await api.extensions.load(item.url);
        return 'Added to this project';
    }
    await api.mods.loadURL(item.url);
    return 'Installed';
};

/** The "Community" part of the Mods panel. */
const communitySection = api => {
    const {h} = api.ui;
    const list = h('div', {className: 'ft-list'}, h('div', {className: 'ft-muted'}, 'Loading…'));
    const status = h('div', {className: 'ft-muted'});
    const who = h('div', {className: 'ft-muted'});
    const say = text => {
        status.textContent = text;
    };

    const draw = items => {
        if (!items.length) {
            list.replaceChildren(h('div', {className: 'ft-muted'}, 'Nothing published yet.'));
            return;
        }
        const installed = new Set(api.mods.urls());
        const session = store.get();
        list.replaceChildren(...items.slice(0, 60).map(item => {
            const have = item.kind === 'mod' && installed.has(item.url);
            const btn = h('button', {
                className: have ? 'ft-btn ft-quiet' : 'ft-btn',
                disabled: have,
                onclick: async () => {
                    btn.disabled = true;
                    btn.textContent = item.kind === 'extension' ? 'Adding…' : 'Installing…';
                    try {
                        btn.textContent = await installItem(api, item);
                        btn.className = 'ft-btn ft-quiet';
                    } catch (e) {
                        btn.disabled = false;
                        btn.textContent = item.kind === 'extension' ? 'Add' : 'Install';
                        say(e.message || String(e));
                    }
                }
            }, have ? 'Installed' : (item.kind === 'extension' ? 'Add' : 'Install'));
            const buttons = [btn];
            if (session && session.admin) {
                const approve = h('button', {
                    className: 'ft-btn ft-quiet',
                    onclick: async () => {
                        approve.disabled = true;
                        try {
                            const updated = await setApproved(item.id, !item.approved, session);
                            say(`${updated.name} is now ${updated.approved ? 'approved' : 'community'}.`);
                            refresh();
                        } catch (e) {
                            approve.disabled = false;
                            say(e.message);
                        }
                    }
                }, item.approved ? 'Unapprove' : 'Approve');
                buttons.push(approve);
            }
            return h('div', {className: 'ft-item'},
                h('div', {className: 'ft-item-main'},
                    h('div', {className: 'ft-note'}, sectionFor(item).note),
                    h('div', {className: 'ft-item-title', title: item.name}, item.name),
                    h('div', {className: 'ft-muted'},
                        [item.description, item.author ? `by @${item.author}` : ''].filter(Boolean).join(' · ') || ' ')),
                ...buttons);
        }));
    };

    const refresh = () => fetchItems().then(draw)
        .catch(e => list.replaceChildren(h('div', {className: 'ft-muted'}, `Couldn't load community items: ${e.message}`)));

    const showWho = () => {
        const session = store.get();
        who.replaceChildren();
        if (!session) return;
        who.append(`Publishing as @${session.username}${session.admin ? ' (admin)' : ''} · `,
            h('a', {
                href: '#',
                onclick: e => {
                    e.preventDefault();
                    store.set(null);
                    showWho();
                    refresh();
                    say('Signed out.');
                }
            }, 'Sign out'));
    };

    const publishButton = (kind, label) => {
        const btn = h('button', {
            className: 'ft-btn',
            onclick: async () => {
                btn.disabled = true;
                try {
                    let session = store.get();
                    if (!session) {
                        session = await signIn(say);
                        showWho();
                        refresh();
                        say(`Signed in as @${session.username}. Pick your ${kind} file.`);
                    }
                    const file = await pickJsFile();
                    if (!file) return say('');
                    say(`Publishing ${file.name}…`);
                    const item = await publishFile(file, kind, session);
                    say(`Published "${item.name}" as ${sectionFor(item).note}. Everyone can get it now.`);
                    api.ui.toast(`Published ${item.name} 🍌`);
                    refresh();
                } catch (e) {
                    say(e.message);
                    showWho();
                } finally {
                    btn.disabled = false;
                }
            }
        }, label);
        return btn;
    };

    const publish = canPublish() ?
        h('div', {className: 'ft-row'},
            publishButton('mod', '🍌 Upload a mod'),
            publishButton('extension', '🧩 Publish an extension')) :
        h('div', {className: 'ft-muted'}, 'Publish mods and extensions from the fromturbo DMG app.');
    if (canPublish()) showWho();

    refresh();
    return h('div', {className: 'ft-list'},
        h('strong', {}, 'Community'),
        publish,
        canPublish() ? who : null,
        list,
        status);
};

export {communitySection, canPublish, fetchItems, installItem, API as MODS_API};

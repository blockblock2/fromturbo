// fromturbo community mods and extensions
//   GET  /api/mods   → {items: [{id, kind, approved, name, description, author, uploaded, url, extId?}]}
//   POST /api/mods   {code, filename, kind: "mod" | "extension"} + Bearer token → {item}
//
// "author" is always the uploader's Scratch username from Scratch Auth. Nothing written
// inside the file is used as a name, so no real names end up in the list.
// "approved" items were approved by an admin (see ADMINS); everything else is "community".

import {CORS, MAX_BYTES, json, readIndex, updateIndex, writeFile} from './_github.js';
import {bearer, isAdmin, readToken} from '../_auth.js';

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);

// Pull a quoted value like name: 'Grid Snap' out of the code.
const field = (code, key) => {
    const m = new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\\\n])*)\\1`).exec(code);
    return m ? m[2].replace(/\\(.)/g, '$1') : '';
};

const slug = s => clean(s, 40).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

const fileURL = (request, id) => new URL(`/api/mods/${id}.js`, request.url).href;

// Older entries (before extensions existed) are mods.
export const shape = (request, item) => ({kind: 'mod', approved: false, ...item, url: fileURL(request, item.id)});

const KINDS = {
    mod: {
        check: code => /fromturbo\s*\.\s*mods\s*\.\s*register\s*\(/.test(code),
        error: 'That isn\'t a fromturbo mod: it needs a fromturbo.mods.register({...}) call.'
    },
    extension: {
        check: code => /Scratch\s*\.\s*extensions\s*\.\s*register\s*\(/.test(code),
        error: 'That isn\'t a custom extension: it needs a Scratch.extensions.register(...) call.'
    }
};

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestGet ({request, env}) {
    try {
        const {mods} = await readIndex(env);
        const items = mods.map(m => shape(request, m));
        // `mods` is kept for older copies of the app, which only know about mods.
        return json({items, mods: items.filter(i => i.kind === 'mod')}, 200, {'Cache-Control': 'max-age=15'});
    } catch (e) {
        return json({error: e.message, items: [], mods: []}, 502);
    }
}

export async function onRequestPost ({request, env}) {
    if (!env.GH_TOKEN || !env.SESSION_SECRET) return json({error: 'Publishing isn\'t set up on this site yet.'}, 503);
    const username = await readToken(bearer(request), env.SESSION_SECRET);
    if (!username) return json({error: 'Sign in with Scratch first.', signIn: true}, 401);

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({error: 'Bad request'}, 400);
    }
    const kind = body.kind === 'extension' ? 'extension' : 'mod';
    const code = String(body.code || '');
    if (!code.trim()) return json({error: 'That file is empty.'}, 400);
    if (new TextEncoder().encode(code).length > MAX_BYTES) return json({error: 'Files can be up to 200 KB.'}, 413);
    if (!KINDS[kind].check(code)) return json({error: KINDS[kind].error}, 400);

    const fileName = clean(body.filename, 80).replace(/\.js$/i, '');
    const name = clean(field(code, 'name'), 60) || fileName || (kind === 'mod' ? 'Untitled mod' : 'Untitled extension');
    const item = {
        id: `${slug(name)}-${crypto.randomUUID().slice(0, 6)}`,
        kind,
        // Things an admin publishes are approved straight away.
        approved: isAdmin(username, env),
        name,
        description: clean(field(code, 'description'), 200),
        author: username,
        uploaded: new Date().toISOString()
    };
    if (kind === 'extension') {
        const extId = clean(field(code, 'id'), 60);
        if (/^[a-z0-9]+$/i.test(extId)) item.extId = extId;
    }

    try {
        await writeFile(env, `mods/${item.id}.js`, code, `Add ${kind}: ${name}`);
        await updateIndex(env, list => [item, ...list.filter(m => m.id !== item.id)], `List ${kind}: ${name}`);
    } catch (e) {
        return json({error: `Publishing failed: ${e.message}`}, 502);
    }
    return json({item: shape(request, item), mod: shape(request, item)}, 201);
}

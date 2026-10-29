// fromturbo community mods
//   GET  /api/mods        → {mods: [{id, name, description, author, uploaded, url}]}
//   POST /api/mods        {code, filename} + Bearer token → {mod}   (Upload in the DMG app)
//
// "author" is always the uploader's Scratch username from Scratch Auth. Nothing written
// inside the mod file is used as a name, so no real names end up in the list.

import {CORS, MAX_BYTES, json, readIndex, writeFile} from './_github.js';
import {bearer, readToken} from '../_auth.js';

const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, max);

// Pull the mod name and description out of the fromturbo.mods.register({...}) call.
const field = (code, key) => {
    const m = new RegExp(`\\b${key}\\s*:\\s*(['"\`])((?:\\\\.|(?!\\1)[^\\\\\\n])*)\\1`).exec(code);
    return m ? m[2].replace(/\\(.)/g, '$1') : '';
};

const slug = s => clean(s, 40).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mod';

const modURL = (request, id) => new URL(`/api/mods/${id}.js`, request.url).href;

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestGet ({request, env}) {
    try {
        const {mods} = await readIndex(env);
        return json({mods: mods.map(m => ({...m, url: modURL(request, m.id)}))}, 200, {'Cache-Control': 'max-age=15'});
    } catch (e) {
        return json({error: e.message, mods: []}, 502);
    }
}

export async function onRequestPost ({request, env}) {
    if (!env.GH_TOKEN || !env.SESSION_SECRET) return json({error: 'Uploads aren\'t set up on this site yet.'}, 503);
    const username = await readToken(bearer(request), env.SESSION_SECRET);
    if (!username) return json({error: 'Sign in with Scratch first.', signIn: true}, 401);

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({error: 'Bad request'}, 400);
    }
    const code = String(body.code || '');
    if (!code.trim()) return json({error: 'That file is empty.'}, 400);
    if (new TextEncoder().encode(code).length > MAX_BYTES) return json({error: 'Mods can be up to 200 KB.'}, 413);
    if (!/fromturbo\s*\.\s*mods\s*\.\s*register\s*\(/.test(code)) {
        return json({error: 'That isn\'t a fromturbo mod: it needs a fromturbo.mods.register({...}) call.'}, 400);
    }

    const fileName = clean(body.filename, 80).replace(/\.js$/i, '');
    const name = clean(field(code, 'name'), 60) || fileName || 'Untitled mod';
    const mod = {
        id: `${slug(name)}-${crypto.randomUUID().slice(0, 6)}`,
        name,
        description: clean(field(code, 'description'), 200),
        author: username,
        uploaded: new Date().toISOString()
    };

    try {
        await writeFile(env, `mods/${mod.id}.js`, code, `Add mod: ${name}`);
        // index.json can change under us if two people upload at once, so retry.
        for (let attempt = 0; ; attempt++) {
            const {mods, sha} = await readIndex(env);
            try {
                await writeFile(env, 'index.json',
                    `${JSON.stringify({mods: [mod, ...mods.filter(m => m.id !== mod.id)]}, null, 2)}\n`,
                    `List mod: ${name}`, sha || undefined);
                break;
            } catch (e) {
                if (attempt >= 4 || ![409, 422].includes(e.status)) throw e;
                await new Promise(r => setTimeout(r, 300 + (Math.random() * 400)));
            }
        }
    } catch (e) {
        return json({error: `Upload failed: ${e.message}`}, 502);
    }
    return json({mod: {...mod, url: modURL(request, mod.id)}}, 201);
}

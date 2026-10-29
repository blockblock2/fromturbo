// GET /api/mods/<id>.js → the mod's code, served as JavaScript so it can be installed by URL.

import {BRANCH, CORS, readFile, repoOf} from './_github.js';

export async function onRequestGet ({params, env}) {
    const m = /^([a-z0-9-]{1,60})\.js$/.exec(params.file || '');
    if (!m) return new Response('Not found', {status: 404, headers: CORS});
    const path = `mods/${m[1]}.js`;

    // The raw file is quickest; fall back to the API right after an upload.
    let code = null;
    const raw = await fetch(`https://raw.githubusercontent.com/${repoOf(env)}/${BRANCH}/${path}`);
    if (raw.ok) {
        code = await raw.text();
    } else {
        const file = await readFile(env, path).catch(() => null);
        if (file) code = file.text;
    }
    if (code === null) return new Response('// mod not found', {status: 404, headers: {...CORS, 'content-type': 'application/javascript'}});
    return new Response(code, {
        headers: {
            ...CORS,
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'public, max-age=60'
        }
    });
}

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

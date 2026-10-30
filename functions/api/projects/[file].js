// GET /api/projects/<id>.sb3 → the saved project, for embeds (any site may load it).

import {BRANCH, CORS, repoOf} from '../mods/_github.js';

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestGet ({params, env}) {
    const m = /^([a-z0-9]{6,20})\.sb3$/.exec(params.file || '');
    if (!m) return new Response('Not found', {status: 404, headers: CORS});
    const path = `projects/${m[1]}.sb3`;

    // The raw file is fastest. Right after saving it can take a moment to appear there,
    // so fall back to the GitHub API, which has it immediately.
    let res = await fetch(`https://raw.githubusercontent.com/${repoOf(env)}/${BRANCH}/${path}`);
    if (!res.ok) {
        res = await fetch(`https://api.github.com/repos/${repoOf(env)}/contents/${path}?ref=${BRANCH}`, {
            headers: {
                'Accept': 'application/vnd.github.raw',
                'User-Agent': 'fromturbo-embeds',
                ...(env.GH_TOKEN ? {Authorization: `Bearer ${env.GH_TOKEN}`} : {})
            }
        });
    }
    if (!res.ok) return new Response('Project not found', {status: 404, headers: CORS});
    return new Response(res.body, {
        headers: {
            ...CORS,
            'content-type': 'application/x.scratch.sb3',
            // Saved projects never change (a new embed gets a new id), so they can be cached.
            'cache-control': 'public, max-age=86400, immutable'
        }
    });
}

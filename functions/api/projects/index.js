// Projects saved for embedding.
//   POST /api/projects?name=My%20Game   body: the .sb3 as base64 text → {id, url}
// Stored in the same public GitHub repo as community mods (MODS_REPO), under projects/<id>.sb3.
//
// The body is plain base64 text (not JSON) so the function never has to parse or
// re-encode a big file: it's pasted straight into the GitHub request.

import {BRANCH, CORS, json, repoOf} from '../mods/_github.js';

export const MAX_SB3_BYTES = 8 * 1024 * 1024;
const DAILY_LIMIT = 20; // embeds per person (IP address) per day

const clean = s => String(s || '').replace(/[^\w .()'!-]/g, '')
    .trim()
    .slice(0, 60) || 'Project';

const randomId = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
};

// Counts embeds per IP per day in the AUTH_KV namespace. Returns false when over the limit.
const underLimit = async (request, env) => {
    if (!env.AUTH_KV) return true;
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `embed-limit:${ip}:${new Date().toISOString()
        .slice(0, 10)}`;
    const used = Number(await env.AUTH_KV.get(key)) || 0;
    if (used >= DAILY_LIMIT) return false;
    await env.AUTH_KV.put(key, String(used + 1), {expirationTtl: 60 * 60 * 26});
    return true;
};

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestPost ({request, env}) {
    if (!env.GH_TOKEN) return json({error: 'Embedding isn\'t set up on this site yet.'}, 503);

    const b64 = (await request.text()).trim();
    if (!b64) return json({error: 'No project was sent.'}, 400);
    // base64 is 4 characters for every 3 bytes
    if (b64.length > Math.ceil(MAX_SB3_BYTES / 3) * 4) {
        return json({error: `Projects can be up to ${MAX_SB3_BYTES / 1024 / 1024} MB to embed.`}, 413);
    }
    // An .sb3 is a zip file, which always starts with "PK" ("UEs" in base64).
    if (!b64.startsWith('UEs') || !/^[A-Za-z0-9+/]+=*$/.test(b64.slice(0, 4096))) {
        return json({error: 'That isn\'t a Scratch project.'}, 400);
    }
    if (!(await underLimit(request, env))) {
        return json({error: `You've made ${DAILY_LIMIT} embeds today. Try again tomorrow.`}, 429);
    }

    const id = randomId();
    const name = clean(new URL(request.url).searchParams.get('name'));
    const body = `{"message":${JSON.stringify(`Embed: ${name}`)},"branch":"${BRANCH}","content":"${b64}"}`;
    const res = await fetch(`https://api.github.com/repos/${repoOf(env)}/contents/projects/${id}.sb3`, {
        method: 'PUT',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${env.GH_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'fromturbo-embeds',
            'X-GitHub-Api-Version': '2022-11-28'
        },
        body
    });
    if (!res.ok) return json({error: `Couldn't save the project (GitHub said ${res.status}).`}, 502);
    return json({id, url: new URL(`/api/projects/${id}.sb3`, request.url).href}, 201);
}

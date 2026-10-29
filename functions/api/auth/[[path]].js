// Scratch Auth sign-in for the fromturbo app.
//
//   GET /api/auth/start?nonce=N       → sends the browser to Scratch Auth
//   GET /api/auth/callback/N          ← Scratch Auth comes back here (?privateCode=…)
//   GET /api/auth/poll?nonce=N        → the app picks up {username, token} once
//   GET /api/auth/me  (Bearer token)  → {username}
//
// The app makes a random nonce, opens /start in the person's browser, and polls until
// the sign-in lands. Only the Scratch username is kept.

import {AUTH_BASE, NONCE_RE, bearer, mintToken, readToken} from '../_auth.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...CORS}
});
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const page = (title, message, status = 200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#3d8bff;color:#fff;
font:16px/1.5 -apple-system,Helvetica,Arial,sans-serif;text-align:center;padding:16px;box-sizing:border-box}
h1{margin:0 0 8px;font-size:26px}p{margin:0;opacity:.9}</style></head>
<body><div><h1>${esc(title)}</h1><p>${message}</p></div></body></html>`, {
    status,
    headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}
});

const configured = env => env.SESSION_SECRET && env.AUTH_KV;

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestGet ({request, env, params}) {
    const url = new URL(request.url);
    const [action, arg] = params.path || [];

    if (action === 'me') {
        const username = await readToken(bearer(request), env.SESSION_SECRET);
        return username ? json({username}) : json({error: 'Not signed in'}, 401);
    }

    if (!configured(env)) {
        return action === 'poll' ? json({error: 'Sign-in isn\'t set up on this site yet.'}, 503) :
            page('Not set up yet', 'Sign-in isn\'t set up on this site yet.', 503);
    }

    if (action === 'start') {
        const nonce = url.searchParams.get('nonce') || '';
        if (!NONCE_RE.test(nonce)) return page('Something went wrong', 'Start signing in from the fromturbo app.', 400);
        const back = `${url.origin}/api/auth/callback/${nonce}`;
        await env.AUTH_KV.put(`pending:${nonce}`, '1', {expirationTtl: 600});
        return Response.redirect(`${AUTH_BASE}/auth/?redirect=${encodeURIComponent(btoa(back))}&name=fromturbo`, 302);
    }

    if (action === 'callback') {
        const nonce = arg || '';
        if (!NONCE_RE.test(nonce) || !(await env.AUTH_KV.get(`pending:${nonce}`))) {
            return page('Sign-in expired', 'Go back to fromturbo and press Upload again.', 400);
        }
        const privateCode = url.searchParams.get('privateCode');
        if (!privateCode) return page('Sign-in cancelled', 'Go back to fromturbo and try again.', 400);
        let data;
        try {
            const r = await fetch(`${AUTH_BASE}/api/auth/verifyToken?privateCode=${encodeURIComponent(privateCode)}`);
            data = await r.json();
        } catch (e) {
            return page('Scratch Auth is down', 'Try again in a minute.', 502);
        }
        // The recorded redirect must be ours, so another site can't replay a code here.
        if (data.valid !== true || !data.username || data.redirect !== `${url.origin}/api/auth/callback/${nonce}`) {
            return page('Sign-in didn\'t work', 'Go back to fromturbo and try again.', 400);
        }
        const token = await mintToken(data.username, env.SESSION_SECRET);
        await env.AUTH_KV.delete(`pending:${nonce}`);
        await env.AUTH_KV.put(`done:${nonce}`, JSON.stringify({username: data.username, token}), {expirationTtl: 600});
        return page(`Signed in as ${data.username}`, 'You can close this tab and go back to fromturbo.');
    }

    if (action === 'poll') {
        const nonce = url.searchParams.get('nonce') || '';
        if (!NONCE_RE.test(nonce)) return json({error: 'Bad request'}, 400);
        const done = await env.AUTH_KV.get(`done:${nonce}`);
        if (!done) return json({waiting: true});
        await env.AUTH_KV.delete(`done:${nonce}`);
        return json(JSON.parse(done));
    }

    return json({error: 'Not found'}, 404);
}

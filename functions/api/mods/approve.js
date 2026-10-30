// POST /api/mods/approve  {id, approved: true|false} + Bearer token (admins only)
// Moves a community mod or extension into the approved section, or back out.

import {CORS, json, updateIndex} from './_github.js';
import {bearer, isAdmin, readToken} from '../_auth.js';
import {shape} from './index.js';

export function onRequestOptions () {
    return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestPost ({request, env}) {
    if (!env.GH_TOKEN || !env.SESSION_SECRET) return json({error: 'Not set up on this site yet.'}, 503);
    const username = await readToken(bearer(request), env.SESSION_SECRET);
    if (!username) return json({error: 'Sign in with Scratch first.', signIn: true}, 401);
    if (!isAdmin(username, env)) return json({error: 'Only fromturbo admins can approve.'}, 403);

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({error: 'Bad request'}, 400);
    }
    const id = String(body.id || '');
    const approved = body.approved !== false;
    let found = null;
    try {
        await updateIndex(env, list => list.map(m => {
            if (m.id !== id) return m;
            found = {...m, approved};
            return found;
        }), `${approved ? 'Approve' : 'Unapprove'}: ${id}`);
    } catch (e) {
        return json({error: `Couldn't save: ${e.message}`}, 502);
    }
    if (!found) return json({error: 'Not found'}, 404);
    return json({item: shape(request, found)});
}

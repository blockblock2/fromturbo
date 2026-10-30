// Sign-in with Scratch Auth (https://auth.itinerary.eu.org) for community mod uploads.
// Only Scratch usernames are ever stored or shown, never real names.
//
// Needs on the Pages project:
//   SESSION_SECRET  secret used to sign tokens (any long random string)
//   AUTH_KV         a KV namespace binding (holds sign-ins for a few minutes while the app picks them up)

export const AUTH_BASE = 'https://auth.itinerary.eu.org';
const TOKEN_DAYS = 30;

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const hmacKey = secret => crypto.subtle.importKey('raw', enc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);

export const mintToken = async (username, secret) => {
    const payload = b64url(enc.encode(JSON.stringify({u: username, exp: Date.now() + (TOKEN_DAYS * 864e5)})));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(payload));
    return `${payload}.${b64url(sig)}`;
};

/** Returns the Scratch username for a valid, unexpired token, else null. */
export const readToken = async (token, secret) => {
    if (!token || !secret) return null;
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    try {
        const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), enc.encode(payload));
        if (!ok) return null;
        const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
        if (!data.u || !(data.exp > Date.now())) return null;
        return data.u;
    } catch (e) {
        return null;
    }
};

export const bearer = request => {
    const h = request.headers.get('Authorization') || '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

// Scratch usernames allowed to approve community mods and extensions.
export const isAdmin = (username, env) => String(env.ADMINS || 'blockblock2').toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .includes(String(username || '').toLowerCase());

export const NONCE_RE = /^[A-Za-z0-9_-]{24,64}$/;

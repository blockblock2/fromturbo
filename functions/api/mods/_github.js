// Community mods are stored in a public GitHub repo (default blockblock2/fromturbo-mods):
//   index.json        the list everyone sees
//   mods/<id>.js      each uploaded mod
// Writing needs a GH_TOKEN secret on the Pages project with Contents: Read and write on that repo.

export const BRANCH = 'main';
export const MAX_BYTES = 200 * 1024;

export const repoOf = env => env.MODS_REPO || 'blockblock2/fromturbo-mods';

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

export const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', ...CORS, ...extra}
});

const b64encode = text => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
};
const b64decode = b64 => {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
};

const gh = (env, path, init = {}) => fetch(`https://api.github.com/repos/${repoOf(env)}/${path}`, {
    ...init,
    headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'fromturbo-mods',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(env.GH_TOKEN ? {Authorization: `Bearer ${env.GH_TOKEN}`} : {}),
        ...(init.headers || {})
    }
});

/** Read a text file. Returns {text, sha} or null if it doesn't exist. */
export const readFile = async (env, path) => {
    const res = await gh(env, `contents/${path}?ref=${BRANCH}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
    const data = await res.json();
    return {text: b64decode(data.content || ''), sha: data.sha};
};

/** Create or replace a text file. `sha` is required when replacing. */
export const writeFile = async (env, path, text, message, sha) => {
    const res = await gh(env, `contents/${path}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message, content: b64encode(text), branch: BRANCH, ...(sha ? {sha} : {})})
    });
    if (!res.ok) {
        const err = new Error(`GitHub write failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return res.json();
};

export const readIndex = async env => {
    const file = await readFile(env, 'index.json');
    if (!file) return {mods: [], sha: null};
    let mods = [];
    try {
        const parsed = JSON.parse(file.text);
        mods = Array.isArray(parsed.mods) ? parsed.mods : [];
    } catch (e) {
        mods = [];
    }
    return {mods, sha: file.sha};
};

/**
 * Change index.json with change(list) → newList, retrying if someone else
 * changed it at the same moment.
 */
export const updateIndex = async (env, change, message) => {
    for (let attempt = 0; ; attempt++) {
        const {mods, sha} = await readIndex(env);
        try {
            await writeFile(env, 'index.json', `${JSON.stringify({mods: change(mods)}, null, 2)}\n`, message, sha || undefined);
            return;
        } catch (e) {
            if (attempt >= 4 || ![409, 422].includes(e.status)) throw e;
            await new Promise(r => setTimeout(r, 300 + (Math.random() * 400)));
        }
    }
};

// Scratch Colab — several people edit one project live, without sharing it on Scratch.
// Uses Firebase Realtime Database over its REST + streaming API (no SDK needed).
//
// Same engine and the same rooms as the Scratch Colab Chrome extension, so people on
// fromturbo and people using the extension on scratch.mit.edu can be in one room.
//
// How sync works: joining downloads the project once. After that only what changed is
// sent: a script you edit goes out as that one script (a few KB), variables one at a time,
// and a sprite's costumes and sounds only when they change. Teammates' changes are put
// straight into your code area — no reloading the project.

import JSZip from '@turbowarp/jszip';

const DEFAULT_DB = 'https://colab-e77ed-default-rtdb.firebaseio.com';
const CHUNK = 4 * 1024 * 1024; // characters of base64 per Firebase value
const STAGE_KEY = '_stage_';
const COLORS = ['#4c97ff', '#9966ff', '#cf63cf', '#ffab19', '#59c059', '#ff6680', '#5cb1d6', '#ff8c1a'];
const BLOCK_FIELDS = ['id', 'opcode', 'next', 'parent', 'inputs', 'fields', 'shadow', 'topLevel', 'x', 'y', 'mutation'];

// ---------- small helpers ----------
const now = () => Date.now();
const wait = ms => new Promise(r => setTimeout(r, ms));
// Lets the editor catch up. Background tabs pause animation frames, so don't wait on one forever:
// a teammate's change arriving while this tab is hidden must not stop your own edits going out.
const settle = async () => {
    await Promise.race([new Promise(r => requestAnimationFrame(() => r())), wait(100)]);
    await wait(150);
};
const randomId = (n, abc = 'abcdefghijkmnpqrstuvwxyz23456789') =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)), b => abc[b % abc.length]).join('');
const toB64 = buf => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
};
const fromB64 = b64 => {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out.buffer;
};
// Firebase keys can't contain . $ # [ ] /, and Scratch block ids often do.
const enc = s => encodeURIComponent(String(s)).replace(/\./g, '%2E');
const dec = s => {
    try {
        return decodeURIComponent(s);
    } catch (e) {
        return s;
    }
};
const spriteLabel = tk => (tk === STAGE_KEY ? 'the Stage' : dec(tk));
const cleanCode = c => String(c || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '');
// Firebase rejects some non-ASCII text, so emoji and accents are sent as \uXXXX escapes.
const asciiJson = v => JSON.stringify(v).replace(/[\u007f-￿]/g,
    c => `\\u${c.charCodeAt(0).toString(16)
        .padStart(4, '0')}`);

/** Turns a failed Firebase response into a message that says what to fix. */
const firebaseProblem = async res => {
    const data = await res.json().catch(() => ({}));
    const said = String(data.error || '');
    if (res.status === 401 || res.status === 403 || /permission denied/i.test(said)) {
        return 'Firebase said "Permission denied". In the Firebase console, open Realtime Database → Rules, ' +
            'paste the Scratch Colab rules from the fromturbo guide, then Publish.';
    }
    if (res.status === 404 || /not found|doesn't exist|does not exist|ensure that you have the URL/i.test(said)) {
        return 'There\'s no Realtime Database at that URL. Copy it from the Firebase console (Realtime Database → Data).';
    }
    if (res.status === 423 || /disabled|deactivated/i.test(said)) return 'That Firebase database is turned off.';
    return `Firebase said ${res.status}${said ? `: ${said}` : ''}`;
};

export default {
    id: 'colab',
    name: 'Scratch Colab',
    description: 'Live collaboration on one project through Firebase — no need to share it on Scratch.',
    author: 'blockblock2',
    builtIn: true,
    run (api, {storage}) {
        const {h} = api.ui;
        const vm = api.vm;
        const editor = () => {
            const ws = api.workspace;
            const SB = api.blocks;
            return {vm, ws: ws && SB ? ws : null, SB};
        };
        const dbBase = () => (storage.get('db', '') || DEFAULT_DB).trim()
            .replace(/\/+$/, '');
        // People who don't type a name show up as "Scratcher 123" (never a real name).
        let anon = storage.get('anon', '');
        if (!anon) {
            anon = randomId(3, '0123456789');
            storage.set('anon', anon);
        }
        const myName = () => storage.get('name', '') || `Scratcher ${anon}`;

        // ================= the editor side =================
        const targetKey = t => (t.isStage ? STAGE_KEY : enc(t.getName()));
        const originals = () => vm.runtime.targets.filter(t => t.isOriginal);
        const targetByKey = tk => originals().find(t => targetKey(t) === tk) || null;

        const scriptBlocks = (target, topId) => {
            const all = target.blocks._blocks;
            const out = [];
            const seenIds = new Set();
            const walk = id => {
                if (!id || seenIds.has(id) || !all[id]) return;
                seenIds.add(id);
                const b = all[id];
                const copy = {};
                for (const k of BLOCK_FIELDS) if (typeof b[k] !== 'undefined') copy[k] = b[k];
                if (typeof copy.x !== 'undefined') copy.x = Math.round(copy.x);
                if (typeof copy.y !== 'undefined') copy.y = Math.round(copy.y);
                out.push(JSON.parse(JSON.stringify(copy)));
                for (const name in b.inputs) {
                    walk(b.inputs[name].block);
                    walk(b.inputs[name].shadow);
                }
                walk(b.next);
            };
            walk(topId);
            out.sort((a, b) => {
                if (a.id < b.id) return -1;
                return a.id > b.id ? 1 : 0;
            });
            return out;
        };
        const readScripts = target => {
            const map = {};
            for (const id of target.blocks.getScripts()) {
                const b = target.blocks.getBlock(id);
                if (b && !b.parent) map[id] = JSON.stringify(scriptBlocks(target, id));
            }
            return map;
        };
        const readVars = target => {
            const map = {};
            for (const [id, v] of Object.entries(target.variables)) {
                map[id] = JSON.stringify({n: v.name, t: v.type || '', c: !!v.isCloud});
            }
            return map;
        };
        const artSig = target => JSON.stringify({
            c: target.getCostumes().map(c => [c.name, c.assetId, c.rotationCenterX, c.rotationCenterY]),
            s: target.getSounds().map(s => [s.name, s.assetId])
        });

        // What this tab last sent or received, so only real changes go out.
        let known = {scripts: {}, vars: {}, art: {}};
        const baselineTarget = t => {
            const tk = targetKey(t);
            known.scripts[tk] = readScripts(t);
            known.vars[tk] = readVars(t);
            known.art[tk] = artSig(t);
        };
        const baselineAll = () => {
            known = {scripts: {}, vars: {}, art: {}};
            for (const t of originals()) baselineTarget(t);
        };

        let live = false;
        let applying = 0; // while > 0, edits are teammates' changes, not ours
        let scanTimer = null;
        let sendLocal = () => {};

        const scan = async () => {
            if (!live) return;
            if (applying) {
                scanTimer = setTimeout(scan, 300);
                return;
            }
            const changes = {scripts: [], vars: [], sprites: [], notes: []};
            const seenTks = new Set();
            for (const t of originals()) {
                const tk = targetKey(t);
                seenTks.add(tk);
                const isNew = !(tk in known.art);
                const sig = artSig(t);
                if (isNew || known.art[tk] !== sig) {
                    if (t.isStage) {
                        if (!isNew) changes.notes.push('backdrops');
                    } else {
                        changes.sprites.push({tk, name: t.getName(), sig, isNew});
                    }
                    known.art[tk] = sig;
                }
                const vars = readVars(t);
                const oldVars = known.vars[tk] || {};
                for (const id in vars) if (vars[id] !== oldVars[id]) changes.vars.push({tk, id, v: JSON.parse(vars[id])});
                for (const id in oldVars) if (!(id in vars)) changes.vars.push({tk, id, v: null});
                known.vars[tk] = vars;

                const scripts = readScripts(t);
                const oldScripts = known.scripts[tk] || {};
                for (const id in scripts) if (scripts[id] !== oldScripts[id]) changes.scripts.push({tk, id, b: scripts[id]});
                for (const id in oldScripts) if (!(id in scripts)) changes.scripts.push({tk, id, b: null});
                known.scripts[tk] = scripts;
            }
            for (const tk in known.art) {
                if (!seenTks.has(tk)) {
                    changes.sprites.push({tk, deleted: true});
                    delete known.art[tk];
                    delete known.scripts[tk];
                    delete known.vars[tk];
                }
            }
            for (const s of changes.sprites) {
                if (s.deleted) continue;
                try {
                    const out = await vm.exportSprite(targetByKey(s.tk).id, 'arraybuffer');
                    s.data = out instanceof ArrayBuffer ? out : await new Response(out).arrayBuffer();
                    // Scratch gives a sprite's blocks new ids when it's added from a file, so send
                    // the exact scripts too. Teammates put them back with the same ids, which keeps
                    // later edits to this sprite from turning into copies.
                    s.scripts = readScripts(targetByKey(s.tk));
                } catch (e) {
                    s.error = String((e && e.message) || e);
                }
            }
            if (changes.scripts.length || changes.vars.length || changes.sprites.length || changes.notes.length) {
                sendLocal(changes);
            }
        };
        const queueScan = (ms = 300) => {
            if (!live) return;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(scan, ms);
        };

        const textToDom = (SB, x) => (SB.utils && SB.utils.xml && SB.utils.xml.textToDom ?
            SB.utils.xml.textToDom(x) : SB.Xml.textToDom(x));
        const withQuietUndo = (SB, fn) => {
            const ev = SB.Events;
            const hadSetter = typeof ev.setRecordUndo === 'function';
            const before = hadSetter ? ev.getRecordUndo() : ev.recordUndo;
            if (hadSetter) ev.setRecordUndo(false);
            else ev.recordUndo = false;
            if (typeof ev.setGroup === 'function') ev.setGroup(true);
            try {
                return fn();
            } finally {
                if (typeof ev.setGroup === 'function') ev.setGroup(false);
                if (hadSetter) ev.setRecordUndo(before);
                else ev.recordUndo = before;
            }
        };
        // Take a block (and everything under it) out of a sprite that isn't on screen.
        const vmDetachAndDelete = (target, id) => {
            const blocks = target.blocks;
            const b = blocks.getBlock(id);
            if (!b) return;
            if (b.parent) {
                const parent = blocks.getBlock(b.parent);
                let oldInput;
                if (parent) for (const name in parent.inputs) if (parent.inputs[name].block === id) oldInput = name;
                blocks.moveBlock({id, oldParent: b.parent, oldInput, newCoordinate: {x: 0, y: 0}});
                const inp = parent && oldInput && parent.inputs[oldInput];
                if (inp && inp.shadow && !inp.block) inp.block = inp.shadow;
            }
            blocks.deleteBlock(id);
        };
        const applyVar = (e, target, id, v) => {
            const onScreen = e.ws && (target === vm.editingTarget || target.isStage);
            const existing = target.variables[id];
            if (!v) {
                if (!existing) return;
                if (onScreen) {
                    try {
                        e.ws.deleteVariableById(id);
                    } catch (err) { /* fine */ }
                }
                if (target.variables[id]) target.deleteVariable(id);
                return;
            }
            if (existing) {
                if (existing.name !== v.n) {
                    target.renameVariable(id, v.n);
                    if (onScreen) {
                        try {
                            e.ws.renameVariableById(id, v.n);
                        } catch (err) { /* fine */ }
                    }
                }
                return;
            }
            target.createVariable(id, v.n, v.t, v.c);
            if (onScreen) {
                try {
                    e.ws.createVariable(v.n, v.t, id, !target.isStage, v.c);
                } catch (err) { /* the palette catches up on its next refresh */ }
            }
        };
        const applyScriptsVm = (target, list) => {
            for (const s of list) vmDetachAndDelete(target, s.id);
            for (const s of list) {
                if (!s.b) continue;
                const blocks = JSON.parse(s.b);
                for (const b of blocks) vmDetachAndDelete(target, b.id);
                for (const b of blocks) target.blocks.createBlock(Object.assign({}, b));
                for (const b of blocks) if (!b.topLevel) target.blocks._deleteScript(b.id);
            }
        };
        const applyScriptsWorkspace = (e, list) => {
            const {ws, SB} = e;
            const BlocksContainer = vm.runtime.getTargetForStage().blocks.constructor;
            withQuietUndo(SB, () => {
                for (const s of list) {
                    const blk = ws.getBlockById(s.id);
                    if (blk) blk.dispose(false);
                }
                for (const s of list) {
                    if (!s.b) continue;
                    const blocks = JSON.parse(s.b);
                    for (const b of blocks) {
                        const other = ws.getBlockById(b.id);
                        if (other && !other.isShadow()) other.dispose(false);
                    }
                    const temp = new BlocksContainer(vm.runtime, true);
                    for (const b of blocks) temp.createBlock(JSON.parse(JSON.stringify(b)));
                    const xml = `<xml xmlns="http://www.w3.org/1999/xhtml">${temp.blockToXML(s.id, {})}</xml>`;
                    SB.Xml.domToWorkspace(textToDom(SB, xml), ws);
                }
            });
        };
        const addSpriteFile = async (data, name, oldTarget) => {
            const wasEditing = oldTarget && vm.editingTarget === oldTarget;
            const before = vm.editingTarget;
            const layer = oldTarget ? oldTarget.getLayerOrder() : null;
            if (oldTarget) vm.deleteSprite(oldTarget.id);
            const ids = new Set(vm.runtime.targets.map(x => x.id));
            await vm.addSprite(data);
            const t = vm.runtime.targets.find(x => x.isOriginal && !ids.has(x.id));
            if (!wasEditing && before && vm.runtime.getTargetById(before.id) && vm.editingTarget !== before) {
                vm.setEditingTarget(before.id);
            }
            if (t && t.getName() !== name) vm.renameSprite(t.id, name);
            if (t && layer !== null && t.getLayerOrder) {
                const diff = t.getLayerOrder() - layer;
                if (diff > 0) t.goBackwardLayers(diff);
            }
            if (t && wasEditing) vm.setEditingTarget(t.id);
            return t;
        };

        // Returns scripts that couldn't go in yet (their sprite hasn't arrived).
        const applyRemote = async changes => {
            if (scanTimer) {
                clearTimeout(scanTimer);
                await scan(); // send our own edits first
            }
            applying++;
            const pending = [];
            // Only what came in counts as synced. Marking whole sprites would swallow
            // edits you make in the moment a teammate's change is going in.
            const newSprites = new Set();
            const gotScripts = new Map(); // target -> Set of script ids
            const gotVars = new Map(); // target -> Set of variable ids
            const note = (map, t, id) => {
                if (!map.has(t)) map.set(t, new Set());
                map.get(t).add(id);
            };
            try {
                for (const s of changes.sprites) {
                    const old = targetByKey(s.tk);
                    if (s.deleted) {
                        if (old) {
                            vm.deleteSprite(old.id);
                            delete known.art[s.tk];
                            delete known.scripts[s.tk];
                            delete known.vars[s.tk];
                        }
                    } else if (s.data) {
                        const t = await addSpriteFile(s.data, s.name, old);
                        if (t && s.scripts) {
                            for (const id of t.blocks.getScripts().slice()) vmDetachAndDelete(t, id);
                            applyScriptsVm(t, Object.entries(s.scripts).map(([id, b]) => ({id, b})));
                            if (t === vm.editingTarget) vm.emitWorkspaceUpdate();
                        }
                        if (t) newSprites.add(t);
                        await settle();
                    }
                }
                const e = editor();
                for (const v of changes.vars) {
                    const t = targetByKey(v.tk);
                    if (t) {
                        applyVar(e, t, v.id, v.v);
                        note(gotVars, t, v.id);
                    }
                }
                const byTarget = new Map();
                for (const s of changes.scripts) {
                    const t = targetByKey(s.tk);
                    if (!t) {
                        pending.push(s);
                        continue;
                    }
                    if (!byTarget.has(t)) byTarget.set(t, []);
                    byTarget.get(t).push(s);
                }
                for (const [t, list] of byTarget) {
                    list.sort((a, b) => (a.b ? 1 : 0) - (b.b ? 1 : 0)); // deletions first
                    const e2 = editor();
                    if (e2.ws && t === vm.editingTarget) applyScriptsWorkspace(e2, list);
                    else applyScriptsVm(t, list);
                    for (const s of list) note(gotScripts, t, s.id);
                }
                await settle();
                const e3 = editor();
                if (e3.ws && e3.ws.refreshToolboxSelection_) {
                    try {
                        e3.ws.refreshToolboxSelection_();
                    } catch (err) { /* optional */ }
                }
            } finally {
                for (const t of newSprites) if (t.blocks) baselineTarget(t);
                const mark = (map, read, kind) => {
                    for (const [t, ids] of map) {
                        if (!t.blocks || newSprites.has(t)) continue;
                        const tk = targetKey(t);
                        const now2 = read(t);
                        const k = known[kind][tk] || (known[kind][tk] = {});
                        for (const id of ids) {
                            if (id in now2) k[id] = now2[id];
                            else delete k[id];
                        }
                    }
                };
                mark(gotScripts, readScripts, 'scripts');
                mark(gotVars, readVars, 'vars');
                applying--;
            }
            return pending;
        };

        // A normal TurboWarp save shortens every block id. Everyone in the room has to keep the
        // same ids (that's how a changed script finds its old copy), so save without shortening.
        const saveProject = async () => {
            const files = vm.saveProjectSb3DontZip();
            files['project.json'] = new TextEncoder().encode(vm.toJSON(null, {allowOptimization: false}));
            const zip = new JSZip();
            for (const [name, content] of Object.entries(files)) zip.file(name, content);
            const data = await zip.generateAsync({type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: {level: 6}});
            return {data, title: api.project.getTitle()};
        };
        const loadProject = async (data, title) => {
            applying++;
            try {
                await api.project.load(data, title);
                await settle();
                await settle();
                baselineAll();
            } finally {
                applying--;
            }
        };

        // ================= the room side (Firebase) =================
        let room = null; // {code, cid, rev, color, host, db}
        let mirror = {}; // copy of rooms/<code>/live
        let seen = {}; // entries already handled
        let es = null;
        let busy = '';
        let error = '';
        let feed = [];
        let connected = false;
        let pendingScripts = [];
        let editingName = '';
        let draw = () => {};

        const fb = async (path, method = 'GET', body) => {
            const db = room ? room.db : dbBase();
            let res;
            try {
                res = await fetch(`${db}/${path}.json`, {
                    method,
                    headers: typeof body === 'undefined' ? {} : {'Content-Type': 'application/json; charset=utf-8'},
                    body: typeof body === 'undefined' ? null : asciiJson(body)
                });
            } catch (e) {
                throw new Error('Couldn\'t reach that database. Check your connection and the database URL.');
            }
            if (!res.ok) throw new Error(await firebaseProblem(res));
            return res.json();
        };

        let queue = Promise.resolve();
        const addFeed = (who, text, bad = false) => {
            feed.unshift({who, text, bad});
            feed = feed.slice(0, 30);
            draw();
        };
        const chain = fn => {
            queue = queue.then(fn).catch(e => addFeed(null, String((e && e.message) || e), true));
            return queue;
        };
        const nameOf = cid => (mirror.people && mirror.people[cid] && mirror.people[cid].name) || 'A teammate';
        const people = () => Object.entries(mirror.people || {})
            .filter(([, v]) => v && now() - (v.at || 0) < 75000)
            .map(([cid, v]) => ({name: v.name, color: v.color, editing: v.editing || '', me: room && cid === room.cid, bot: !!v.bot}))
            .filter((p, i, all) => !p.bot || all.findIndex(q => q.bot) === i)
            .sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));

        const uploadProject = async (code, rev) => {
            const {data, title} = await saveProject();
            const b64 = toB64(data);
            const chunks = Math.max(1, Math.ceil(b64.length / CHUNK));
            for (let i = 0; i < chunks; i++) {
                busy = chunks > 1 ? `Uploading the project (${i + 1} of ${chunks})…` : 'Uploading the project…';
                draw();
                await fb(`rooms/${code}/files/${rev}/${i}`, 'PUT', b64.slice(i * CHUNK, (i + 1) * CHUNK));
            }
            return {chunks, title};
        };
        const downloadProject = async (code, meta) => {
            let b64 = '';
            for (let i = 0; i < meta.chunks; i++) {
                busy = meta.chunks > 1 ? `Downloading the project (${i + 1} of ${meta.chunks})…` : 'Downloading the project…';
                draw();
                const part = await fb(`rooms/${code}/files/${meta.rev}/${i}`);
                if (typeof part !== 'string') {
                    throw new Error('The shared project is missing. Ask whoever started the colab to press Send my version to everyone.');
                }
                b64 += part;
            }
            return fromB64(b64);
        };

        const setAt = (obj, parts, value) => {
            if (!parts.length) return value;
            const [head, ...rest] = parts;
            const base = obj && typeof obj === 'object' ? obj : {};
            const next = setAt(base[head], rest, value);
            if (next === null || typeof next === 'undefined') delete base[head];
            else base[head] = next;
            return base;
        };
        const applyToMirror = (kind, path, data) => {
            const parts = String(path || '/').split('/')
                .filter(Boolean);
            if (kind === 'put') mirror = setAt(mirror, parts, data) || {};
            else {
                for (const [k, v] of Object.entries(data || {})) {
                    mirror = setAt(mirror, parts.concat(k.split('/').filter(Boolean)), v) || {};
                }
            }
        };
        const flatten = () => {
            const out = {};
            for (const [tk, list] of Object.entries(mirror.scripts || {})) {
                for (const [id, v] of Object.entries(list || {})) out[`s/${tk}/${id}`] = v;
            }
            for (const [tk, list] of Object.entries(mirror.vars || {})) {
                for (const [id, v] of Object.entries(list || {})) out[`v/${tk}/${id}`] = v;
            }
            for (const [tk, v] of Object.entries(mirror.sprites || {})) out[`p/${tk}`] = v;
            return out;
        };

        const process = async () => {
            if (!room) return;
            const meta = mirror.meta || {};
            if (meta.rev && meta.rev !== room.rev) { // someone sent their whole project
                room.rev = meta.rev;
                if (meta.by !== room.cid) {
                    const data = await downloadProject(room.code, meta);
                    busy = 'Opening the new version…';
                    draw();
                    await loadProject(data, meta.title);
                    busy = '';
                    addFeed(nameOf(meta.by), 'sent their version of the project to everyone.');
                }
                seen = {};
                pendingScripts = [];
            }
            const flat = flatten();
            const changes = {scripts: [], vars: [], sprites: []};
            const told = new Map();
            const tell = (v, text) => {
                const who = v.bot ? 'Scratchity [BOT]' : nameOf(v.by);
                if (!told.has(who)) told.set(who, new Set());
                told.get(who).add(text);
            };
            for (const [key, v] of Object.entries(flat)) {
                const str = JSON.stringify(v);
                if (seen[key] === str) continue;
                seen[key] = str;
                if (!v || v.by === room.cid) continue;
                const [kind, tk, rawId] = key.split('/');
                if (kind === 's') {
                    changes.scripts.push({tk, id: dec(rawId), b: v.b || null});
                    tell(v, `${v.b ? 'changed' : 'removed'} a script in ${spriteLabel(tk)}`);
                } else if (kind === 'v') {
                    changes.vars.push({tk, id: dec(rawId), v: v.del ? null : {n: v.n, t: v.t || '', c: !!v.c}});
                    let what = 'variable';
                    if (v.t === 'list') what = 'list';
                    else if (v.t === 'broadcast_msg') what = 'message';
                    tell(v, `${v.del ? 'deleted' : 'updated'} the ${what} "${v.n}"`);
                } else if (kind === 'p') {
                    if (v.del) {
                        changes.sprites.push({tk, deleted: true});
                        tell(v, `deleted ${spriteLabel(tk)}`);
                        continue;
                    }
                    const file = await fb(`rooms/${room.code}/spritefiles/${encodeURIComponent(tk)}`);
                    if (!file || typeof file.d !== 'string') continue;
                    let scripts = null;
                    try {
                        scripts = typeof file.s === 'string' ? JSON.parse(file.s) : null;
                    } catch (e) { /* sent by an older Scratch Colab: no exact scripts */ }
                    changes.sprites.push({tk, name: v.name, data: fromB64(file.d), scripts});
                    tell(v, `${v.isNew ? 'added' : 'updated the costumes or sounds of'} ${v.name}`);
                }
            }
            for (const k of Object.keys(seen)) if (!(k in flat)) delete seen[k];
            changes.scripts = pendingScripts.concat(changes.scripts);
            pendingScripts = [];
            if (changes.scripts.length || changes.vars.length || changes.sprites.length) {
                pendingScripts = await applyRemote(changes);
                for (const [who, set] of told) for (const text of set) addFeed(who, text);
            }
            draw();
        };

        sendLocal = ch => chain(async () => {
            if (!room) return;
            const {code, cid} = room;
            const at = {'.sv': 'timestamp'};
            const patch = {};
            let bigSprite = '';
            for (const s of ch.sprites) {
                if (s.deleted) {
                    patch[`sprites/${s.tk}`] = {del: true, by: cid, who: myName(), at};
                    continue;
                }
                if (!s.data) {
                    addFeed(null, `Couldn't send ${s.name}'s costumes: ${s.error || 'unknown problem'}`, true);
                    continue;
                }
                const d = toB64(s.data);
                if (d.length > 9.5 * 1024 * 1024) {
                    bigSprite = s.name;
                    continue;
                }
                const v = randomId(6);
                await fb(`rooms/${code}/spritefiles/${encodeURIComponent(s.tk)}`, 'PUT',
                    {v, d, s: JSON.stringify(s.scripts || {})});
                patch[`sprites/${s.tk}`] = {name: s.name, sig: s.sig, v, isNew: !!s.isNew, by: cid, who: myName(), at};
            }
            for (const v of ch.vars) {
                patch[`vars/${v.tk}/${enc(v.id)}`] = v.v ?
                    {n: v.v.n, t: v.v.t, c: v.v.c, by: cid, at} :
                    {del: true, n: '', by: cid, at};
            }
            for (const s of ch.scripts) patch[`scripts/${s.tk}/${enc(s.id)}`] = {b: s.b, by: cid, at};
            if (Object.keys(patch).length) await fb(`rooms/${code}/live`, 'PATCH', patch);
            if (bigSprite) addFeed(null, `${bigSprite} is too big to send live. Press Send my version to everyone instead.`, true);
            if (ch.notes.includes('backdrops')) {
                addFeed(null, 'Backdrop changes don\'t sync live. Press Send my version to everyone when you\'re done.');
            }
        });

        const heartbeat = async () => {
            if (!room) return;
            try {
                await fb(`rooms/${room.code}/live/people/${room.cid}`, 'PATCH',
                    {name: myName(), color: room.color, at: now(), editing: editingName});
            } catch (e) { /* the next beat retries */ }
            draw();
        };
        let beatTimer = null;
        const openStream = () => {
            if (es) es.close();
            const code = room.code;
            es = new EventSource(`${room.db}/rooms/${code}/live.json`);
            const onData = kind => ev => {
                if (!room || room.code !== code) return;
                let msg;
                try {
                    msg = JSON.parse(ev.data);
                } catch (e) {
                    return;
                }
                if (!msg) return;
                applyToMirror(kind, msg.path, msg.data);
                connected = true;
                chain(process);
            };
            es.addEventListener('put', onData('put'));
            es.addEventListener('patch', onData('patch'));
            es.addEventListener('cancel', () => {
                error = 'Firebase stopped the live connection (permission denied). Check the database rules.';
                connected = false;
                draw();
            });
            es.onerror = () => {
                connected = false;
                draw();
            };
            es.onopen = () => {
                connected = true;
                draw();
            };
        };
        const beginLive = () => {
            mirror = {};
            seen = {};
            pendingScripts = [];
            busy = '';
            error = '';
            baselineAll();
            live = true;
            openStream();
            clearInterval(beatTimer);
            beatTimer = setInterval(heartbeat, 20000);
            draw();
        };
        const stopLive = () => {
            live = false;
            clearTimeout(scanTimer);
            if (es) es.close();
            es = null;
            connected = false;
            clearInterval(beatTimer);
            mirror = {};
            seen = {};
        };

        const start = async () => {
            if (room) throw new Error('You\'re already in a colab. Leave it first.');
            const code = randomId(10);
            const cid = randomId(12);
            const rev = randomId(8);
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            room = {code, cid, rev, color, host: true, db: dbBase()};
            try {
                busy = 'Getting the project ready…';
                draw();
                const up = await uploadProject(code, rev);
                await fb(`rooms/${code}/live`, 'PUT', {
                    meta: {rev, chunks: up.chunks, by: cid, at: {'.sv': 'timestamp'}, title: up.title, created: {'.sv': 'timestamp'}},
                    people: {[cid]: {name: myName(), color, at: now(), editing: editingName}}
                });
                beginLive();
                addFeed(null, `You started a colab${up.title ? ` on "${up.title}"` : ''}. Share the code so others can join.`);
            } catch (e) {
                room = null;
                throw e;
            }
        };
        const join = async rawCode => {
            if (room) throw new Error('You\'re already in a colab. Leave it first.');
            const code = cleanCode(rawCode);
            if (code.length < 10) throw new Error('That code looks too short. Codes are 10 letters and numbers.');
            const cid = randomId(12);
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            room = {code, cid, rev: '', color, host: false, db: dbBase()};
            try {
                busy = 'Finding the colab…';
                draw();
                const meta = await fb(`rooms/${code}/live/meta`);
                if (!meta || !meta.rev) throw new Error('No colab with that code. Check it and try again.');
                const data = await downloadProject(code, meta);
                busy = 'Opening the project…';
                draw();
                await loadProject(data, meta.title);
                room.rev = meta.rev;
                await fb(`rooms/${code}/live/people/${cid}`, 'PUT', {name: myName(), color, at: now(), editing: editingName});
                beginLive();
                addFeed(null, `You joined${meta.title ? ` "${meta.title}"` : ' the colab'}.`);
            } catch (e) {
                room = null;
                throw e;
            }
        };
        const leave = async () => {
            if (!room) return;
            const r = room;
            stopLive();
            room = null;
            feed = [];
            draw();
            await fetch(`${r.db}/rooms/${r.code}/live/people/${r.cid}.json`, {method: 'DELETE'}).catch(() => {});
        };
        const resync = async () => {
            if (!room) return;
            clearTimeout(scanTimer);
            await scan();
            const rev = randomId(8);
            const old = room.rev;
            const up = await uploadProject(room.code, rev);
            room.rev = rev;
            await fb(`rooms/${room.code}/live`, 'PATCH', {
                meta: {rev,
                    chunks: up.chunks,
                    by: room.cid,
                    at: {'.sv': 'timestamp'},
                    title: up.title,
                    created: (mirror.meta && mirror.meta.created) || {'.sv': 'timestamp'}},
                scripts: null,
                vars: null,
                sprites: null
            });
            await fb(`rooms/${room.code}/files/${old}`, 'DELETE').catch(() => {});
            await fb(`rooms/${room.code}/spritefiles`, 'DELETE').catch(() => {});
            busy = '';
            baselineAll();
            addFeed(null, 'You sent your version of the project to everyone.');
        };

        // For tests and troubleshooting in the browser console.
        window.__fromturboColab = {
            state: () => ({live, applying, inRoom: !!room, connected, busy, error, scanQueued: !!scanTimer}),
            known: () => known,
            mirror: () => mirror,
            scan
        };

        // Watch for edits. Project changes fire on every edit; the timer is a backstop.
        const onTargets = () => queueScan();
        api.on('projectChanged', () => queueScan());
        vm.on('targetsUpdate', onTargets);
        api.every(2000, () => {
            if (live && !applying) queueScan(0);
        });
        api.every(1000, () => {
            if (!room || !vm.editingTarget) return;
            const name = vm.editingTarget.isStage ? 'Stage' : vm.editingTarget.getName();
            if (name !== editingName) {
                editingName = name;
                heartbeat();
            }
        });
        const onUnload = () => {
            if (!room) return;
            try {
                fetch(`${room.db}/rooms/${room.code}/live/people/${room.cid}.json`, {method: 'DELETE', keepalive: true});
            } catch (e) { /* best effort */ }
        };
        window.addEventListener('pagehide', onUnload);
        api.onCleanup(() => {
            vm.removeListener('targetsUpdate', onTargets);
            window.removeEventListener('pagehide', onUnload);
            leave();
        });

        // ================= the panel =================
        const act = fn => chain(async () => {
            error = '';
            try {
                await fn();
            } catch (e) {
                error = String((e && e.message) || e);
                if (room && !live) room = null;
            }
            busy = '';
            draw();
        });

        const open = () => api.ui.openPanel({
            id: 'colab',
            title: 'Scratch Colab',
            render (body) {
                const dbInput = h('input', {
                    'type': 'url',
                    'placeholder': DEFAULT_DB,
                    'value': dbBase(),
                    'aria-label': 'Firebase Realtime Database URL'
                });
                dbInput.addEventListener('change', () => storage.set('db', dbInput.value.trim() || DEFAULT_DB));
                const nameInput = h('input', {'type': 'text', 'placeholder': 'Your name', 'value': storage.get('name', ''), 'aria-label': 'Your name'});
                nameInput.addEventListener('change', () => {
                    storage.set('name', nameInput.value.trim());
                    heartbeat();
                });
                const codeInput = h('input', {'type': 'text', 'placeholder': 'Room code', 'aria-label': 'Room code'});
                const area = h('div', {className: 'ft-list'});

                draw = () => {
                    const kids = [];
                    if (room && live) {
                        const copy = h('button', {className: 'ft-btn ft-quiet'}, 'Copy');
                        copy.addEventListener('click', () => {
                            navigator.clipboard.writeText(room.code).then(() => api.ui.toast('Room code copied'), () => {});
                        });
                        kids.push(
                            h('div', {className: 'ft-row'},
                                h('div', {}, 'Room code: ', h('strong', {}, room.code)), copy),
                            h('div', {className: 'ft-row'},
                                h('button', {className: 'ft-btn ft-quiet', onclick: () => act(resync)}, 'Send my version to everyone'),
                                h('button', {className: 'ft-btn ft-quiet', onclick: () => act(leave)}, 'Leave')),
                            h('div', {className: 'ft-muted'}, connected ? '● Live' : 'Connecting…'),
                            h('div', {className: 'ft-muted'}, 'People here'),
                            ...people().map(p => h('div', {className: 'ft-item'},
                                h('div', {className: 'ft-item-main'},
                                    h('div', {className: 'ft-item-title', style: `color:${p.color || 'inherit'}`},
                                        `${p.bot ? 'Scratchity [BOT]' : p.name}${p.me ? ' (you)' : ''}`),
                                    p.editing ? h('div', {className: 'ft-muted'}, `editing ${p.editing}`) : null)))
                        );
                    } else {
                        const startBtn = h('button', {className: 'ft-btn', onclick: () => act(start)}, 'Start a colab with my project');
                        const joinBtn = h('button', {className: 'ft-btn ft-quiet', onclick: () => act(() => join(codeInput.value))}, 'Join');
                        if (busy) startBtn.disabled = joinBtn.disabled = true;
                        kids.push(startBtn, h('div', {className: 'ft-row'}, codeInput, joinBtn));
                    }
                    if (busy) kids.push(h('div', {className: 'ft-muted'}, busy));
                    if (error) kids.push(h('div', {className: 'ft-muted', style: 'color:#e5484d'}, error));
                    if (feed.length) {
                        kids.push(h('div', {className: 'ft-muted'}, 'What happened'),
                            ...feed.slice(0, 8).map(f => h('div', {className: 'ft-muted', style: f.bad ? 'color:#e5484d' : ''},
                                f.who ? `${f.who} ${f.text}` : f.text)));
                    }
                    area.replaceChildren(...kids);
                };

                body.append(
                    h('label', {className: 'ft-muted'}, 'Firebase Realtime Database URL'), dbInput,
                    nameInput,
                    area,
                    h('div', {className: 'ft-muted'},
                        'Only the scripts, variables and sprites you change are sent, so teammates see your edits ' +
                        'in about a second. Works with the Scratch Colab Chrome extension too: same rooms.')
                );
                draw();
                return () => {
                    draw = () => {};
                };
            }
        });
        api.ui.addMenuButton('Colab', open, {title: 'Edit this project live with other people'});
    }
};

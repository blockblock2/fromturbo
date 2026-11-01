// Scratch Colab — several people edit one project live, without sharing it on Scratch.
// Uses Firebase Realtime Database over its REST + streaming API (no SDK needed).
//
// How sync works: after you stop editing for a moment, your copy of the project
// (an .sb3, assets included) is saved to the room. Everyone else in the room
// gets it automatically. If two people change things at the same moment,
// the last save wins — so it works best when people edit different sprites.

const MAX_BYTES = 9 * 1024 * 1024; // Realtime Database's per-write limit is ~10MB
const SAVE_DELAY = 1500;

const toBase64 = async blob => {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    }
    return btoa(bin);
};
const fromBase64 = b64 => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
};

const cleanRoom = text => text.trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 40);
const randomRoom = () => Math.random().toString(36)
    .slice(2, 8);
const clientId = Math.random().toString(36)
    .slice(2, 12);

/** Turns a failed Firebase response into a message that says what to fix. */
const firebaseProblem = async res => {
    const data = await res.json().catch(() => ({}));
    const said = String(data.error || '');
    if (res.status === 401 || /permission denied/i.test(said)) {
        return 'Firebase said "Permission denied". In the Firebase console, open Realtime Database → Rules ' +
            'and allow the fromturbo-colab path (see the fromturbo guide), then Publish.';
    }
    if (res.status === 404 || /not found|doesn't exist|does not exist/i.test(said)) {
        return 'There\'s no Realtime Database at that URL. Copy it from the Firebase console (Realtime Database → Data).';
    }
    if (res.status === 423 || /disabled|deactivated/i.test(said)) {
        return 'That Firebase database is turned off.';
    }
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
        let session = null; // {db, room, stream, heartbeat}
        let applyingRemote = false;
        let saveTimer = null;
        let lastRev = 0;
        let setStatus = () => {};
        let refreshPeople = () => {};

        const dbURL = path => `${session.db}/fromturbo-colab/${session.room}/${path}.json`;

        const pushProject = async () => {
            if (!session || applyingRemote) return;
            const blob = await api.project.getSb3();
            if (blob.size > MAX_BYTES) {
                setStatus(`Project is ${(blob.size / 1048576).toFixed(1)} MB — too big to sync (limit 9 MB).`);
                return;
            }
            const rev = Date.now();
            lastRev = rev;
            const body = {
                sb3: await toBase64(blob),
                title: api.project.getTitle(),
                by: clientId,
                name: storage.get('name', 'Someone'),
                rev
            };
            const res = await fetch(dbURL('project'), {method: 'PUT', body: JSON.stringify(body)});
            setStatus(res.ok ? `Synced at ${new Date().toLocaleTimeString()}` : `Sync failed (${res.status})`);
        };

        const pullProject = async () => {
            const res = await fetch(dbURL('project'));
            const data = await res.json();
            if (!data || !data.sb3 || data.by === clientId || data.rev <= lastRev) return;
            lastRev = data.rev;
            const targetName = api.project.editingTarget() && api.project.editingTarget().getName();
            applyingRemote = true;
            try {
                await api.project.load(fromBase64(data.sb3), data.title);
                // put the user back on the sprite they were editing
                const same = api.vm.runtime.targets.find(t => t.isOriginal && t.getName() === targetName);
                if (same) api.vm.setEditingTarget(same.id);
                setStatus(`Got ${data.name || 'someone'}'s changes`);
            } finally {
                setTimeout(() => {
                    applyingRemote = false;
                }, 800);
            }
        };

        const onChange = () => {
            if (!session || applyingRemote) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => pushProject().catch(e => setStatus(`Sync failed: ${e.message}`)), SAVE_DELAY);
        };
        const offChange = api.on('projectChanged', onChange);

        const leave = () => {
            if (!session) return;
            session.stream.close();
            clearInterval(session.heartbeat);
            fetch(dbURL(`people/${clientId}`), {method: 'DELETE'}).catch(() => {});
            session = null;
            setStatus('Not in a room');
            refreshPeople({});
        };

        const join = async (db, room, {startWithMine}) => {
            leave();
            session = {db: db.replace(/\/+$/, ''), room};
            const me = () => fetch(dbURL(`people/${clientId}`), {
                method: 'PUT',
                body: JSON.stringify({name: storage.get('name', 'Someone'), seen: Date.now()})
            });
            // Check the database answers before going further, so a wrong URL or missing
            // rules show a clear message instead of "reconnecting…" forever.
            let first;
            try {
                first = await me();
            } catch (e) {
                throw new Error('Couldn\'t reach that database. Check the URL.');
            }
            if (!first.ok) throw new Error(await firebaseProblem(first));
            session.heartbeat = setInterval(me, 20000);

            const existing = await (await fetch(dbURL('project/rev'))).json();
            if (startWithMine || !existing) await pushProject();
            else await pullProject();

            // live updates: Realtime Database streams changes as server-sent events
            session.stream = new EventSource(`${session.db}/fromturbo-colab/${room}.json`);
            const handle = e => {
                const msg = JSON.parse(e.data);
                if (!msg) return;
                if (msg.path.startsWith('/project')) pullProject().catch(console.error);
                if (msg.path === '/' || msg.path.startsWith('/people')) {
                    fetch(dbURL('people')).then(r => r.json())
                        .then(p => refreshPeople(p || {}));
                }
            };
            session.stream.addEventListener('put', handle);
            session.stream.addEventListener('patch', handle);
            session.stream.addEventListener('cancel', () => {
                setStatus('Firebase stopped letting fromturbo read this room. Check the database rules.');
                leave();
            });
            session.stream.onerror = () => {
                if (session && session.stream.readyState === EventSource.CLOSED) {
                    setStatus('Lost the connection to the database. Press Join room to try again.');
                    leave();
                } else {
                    setStatus('Connection dropped — reconnecting…');
                }
            };
            session.stream.onopen = () => setStatus(`In room "${room}"`);
            setStatus(`In room "${room}"`);
        };

        window.addEventListener('beforeunload', leave);

        // fromturbo's shared database. People can paste their own instead.
        const DEFAULT_DB = 'https://colab-e77ed-default-rtdb.firebaseio.com';

        const open = () => api.ui.openPanel({
            id: 'colab',
            title: 'Scratch Colab',
            render (body) {
                const dbInput = h('input', {
                    'type': 'url',
                    'placeholder': 'https://your-project-default-rtdb.firebaseio.com',
                    'value': storage.get('db', '') || DEFAULT_DB,
                    'aria-label': 'Firebase Realtime Database URL'
                });
                const nameInput = h('input', {'type': 'text', 'placeholder': 'Your name', 'value': storage.get('name', ''), 'aria-label': 'Your name'});
                const roomInput = h('input', {'type': 'text', 'placeholder': 'Room code', 'value': session ? session.room : '', 'aria-label': 'Room code'});
                const status = h('div', {className: 'ft-muted'}, session ? `In room "${session.room}"` : 'Not in a room');
                const people = h('div', {className: 'ft-list'});
                setStatus = text => {
                    status.textContent = text;
                };
                refreshPeople = list => {
                    people.replaceChildren(...Object.values(list).map(p =>
                        h('div', {className: 'ft-item'}, h('div', {className: 'ft-item-main'}, p.name || 'Someone'))));
                };

                const go = async startWithMine => {
                    const db = dbInput.value.trim();
                    if (!/^https:\/\/.+/.test(db)) return setStatus('Paste a Firebase Realtime Database URL first.');
                    let room = cleanRoom(roomInput.value);
                    if (!room) room = randomRoom();
                    roomInput.value = room;
                    storage.set('db', db);
                    storage.set('name', nameInput.value.trim() || 'Someone');
                    setStatus('Joining…');
                    try {
                        await join(db, room, {startWithMine});
                    } catch (e) {
                        setStatus(`Couldn't join: ${e.message}`);
                        session = null;
                    }
                };

                body.append(
                    h('label', {className: 'ft-muted'}, 'Firebase Realtime Database URL'), dbInput,
                    nameInput,
                    roomInput,
                    h('div', {className: 'ft-row'},
                        h('button', {className: 'ft-btn', onclick: () => go(true)}, 'Start room with my project'),
                        h('button', {className: 'ft-btn ft-quiet', onclick: () => go(false)}, 'Join room'),
                        h('button', {className: 'ft-btn ft-quiet', onclick: leave}, 'Leave')),
                    status,
                    h('div', {className: 'ft-muted'}, 'People here'),
                    people,
                    h('div', {className: 'ft-muted'},
                        'Share the room code with your team. Changes sync a second after you stop editing; ' +
                        'if two people edit at once, the last save wins.')
                );
            }
        });

        const removeButton = api.ui.addMenuButton('Colab', open, {title: 'Edit this project together'});
        return () => {
            leave();
            offChange();
            removeButton();
            window.removeEventListener('beforeunload', leave);
        };
    }
};

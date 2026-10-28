// Scratchity — describe what you want, get real Scratch blocks in the selected sprite.
// Talks to /api/scratchity (a Cloudflare Pages Function running Qwen2.5-Coder on Workers AI).

const ENDPOINT = '/api/scratchity';

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const describeTarget = target => {
    if (!target) return {name: 'Sprite1', isStage: false, variables: [], lists: [], costumes: [], sounds: []};
    const vars = Object.values(target.variables || {});
    return {
        name: target.getName(),
        isStage: target.isStage,
        variables: vars.filter(v => v.type === '').map(v => v.name),
        lists: vars.filter(v => v.type === 'list').map(v => v.name),
        broadcasts: vars.filter(v => v.type === 'broadcast_msg').map(v => v.name),
        costumes: target.getCostumes().map(c => c.name),
        sounds: target.getSounds().map(s => s.name)
    };
};

export default {
    id: 'scratchity',
    name: 'Scratchity',
    description: 'AI block writer — type what you want and it builds the scripts in the selected sprite.',
    author: 'blockblock2',
    builtIn: true,
    run (api) {
        const {h} = api.ui;
        const open = () => api.ui.openPanel({
            id: 'scratchity',
            title: 'Scratchity',
            render (body) {
                const prompt = h('textarea', {
                    'placeholder': 'e.g. When the green flag is clicked, glide to a random spot forever and say hi when touching the mouse',
                    'aria-label': 'What should the code do?'
                });
                const status = h('div', {className: 'ft-muted'});
                const preview = h('pre', {className: 'ft-pre', hidden: true});
                let lastXML = '';

                const addBtn = h('button', {className: 'ft-btn', disabled: true}, 'Add to sprite');
                const genBtn = h('button', {className: 'ft-btn'}, 'Generate');
                const sb3Btn = h('button', {className: 'ft-btn ft-quiet'}, 'Download .sb3');

                const targetLine = () => {
                    const t = api.project.editingTarget();
                    status.textContent = t ? `Adds to: ${t.getName()}` : '';
                };
                targetLine();
                const offTarget = api.on('targetsUpdate', targetLine);

                genBtn.addEventListener('click', async () => {
                    const text = prompt.value.trim();
                    if (!text) return prompt.focus();
                    genBtn.disabled = true;
                    addBtn.disabled = true;
                    status.textContent = 'Writing code…';
                    try {
                        const res = await fetch(ENDPOINT, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({prompt: text, target: describeTarget(api.project.editingTarget())})
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || !data.xml) throw new Error(data.error || `Server said ${res.status}`);
                        lastXML = data.xml;
                        preview.textContent = data.xml;
                        preview.hidden = false;
                        addBtn.disabled = false;
                        status.textContent = 'Ready — check it, then add it.';
                    } catch (e) {
                        status.textContent = `Couldn't generate: ${e.message}`;
                    } finally {
                        genBtn.disabled = false;
                    }
                });

                addBtn.addEventListener('click', async () => {
                    try {
                        const count = await api.project.addBlocksXML(lastXML);
                        api.ui.toast(`Added ${count} script${count === 1 ? '' : 's'} to ${api.project.editingTarget().getName()}`);
                        addBtn.disabled = true;
                    } catch (e) {
                        status.textContent = `Couldn't add: ${e.message}. Try generating again.`;
                    }
                });

                sb3Btn.addEventListener('click', async () => {
                    const blob = await api.project.getSb3();
                    downloadBlob(blob, `${api.project.getTitle() || 'Project'}.sb3`);
                });

                body.append(
                    prompt,
                    h('div', {className: 'ft-row'}, genBtn, addBtn, sb3Btn),
                    status,
                    preview
                );
                prompt.focus();
                return offTarget;
            }
        });
        return api.ui.addMenuButton('Scratchity', open, {title: 'Write code with AI'});
    }
};

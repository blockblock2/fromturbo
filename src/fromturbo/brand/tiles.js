// Card pictures (600×300, like the rest of the extension library) for fromturbo's own
// mods and for community uploads, which don't come with a picture.

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

const tile = ({from, to, glyph, label}) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
<rect width="600" height="300" fill="url(#g)"/>
<circle cx="300" cy="150" r="190" fill="#fff" opacity=".07"/><circle cx="300" cy="150" r="120" fill="#fff" opacity=".07"/>
<text x="300" y="168" font-size="96" text-anchor="middle"
 font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${esc(glyph)}</text>
<text x="300" y="262" font-size="30" font-weight="700" fill="#fff" text-anchor="middle"
 font-family="Helvetica Neue,Helvetica,Arial,sans-serif">${esc(label)}</text>
</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const BLUE = {from: '#4c97ff', to: '#1f5cc2'};
const COMMUNITY = {from: '#59c08c', to: '#2f8f63'};

export const BUILTIN_MOD_TILES = {
    'scratchity': tile({...BLUE, glyph: '✨', label: 'Scratchity'}),
    'colab': tile({...BLUE, glyph: '👥', label: 'Scratch Colab'}),
    'scratchpack': tile({...BLUE, glyph: '📦', label: '.scratchpack'}),
    'embed': tile({...BLUE, glyph: '🖼️', label: 'Embed'})
};

/** Picture for a community item, coloured by whether it's approved. */
export const itemTile = item => tile({
    ...(item.approved ? BLUE : COMMUNITY),
    glyph: item.kind === 'extension' ? '🧩' : '🍌',
    label: item.approved ? 'fromturbo' : 'Community'
});

export const MOD_FALLBACK_TILE = tile({...BLUE, glyph: '🍌', label: 'fromturbo mod'});

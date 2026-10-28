// fromturbo — Scratchity backend (Cloudflare Pages Function at /api/scratchity)
// Turns a plain-English request into Scratch Blocks XML using Qwen2.5-Coder on Workers AI.
// Needs a Workers AI binding named AI (set in wrangler.toml).

const MODEL = '@cf/qwen/qwen2.5-coder-32b-instruct';
const MAX_PROMPT = 1500;

const SYSTEM = `You write Scratch 3 code as Scratch Blocks XML. Reply with ONLY one <xml>...</xml> element, no explanation.

Rules:
- Use only real Scratch 3 opcodes (event_whenflagclicked, motion_movesteps, control_forever, looks_sayforsecs, data_setvariableto, etc.).
- Every top-level script is a <block> directly inside <xml>. Chain blocks with <next>. Put C-block contents in <statement name="SUBSTACK"> (and SUBSTACK2 for if-else).
- Numbers and text go in shadow blocks inside <value>, e.g.
  <value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
  <value name="MESSAGE"><shadow type="text"><field name="TEXT">Hello!</field></shadow></value>
- Menus use their shadow block, e.g.
  <value name="TO"><shadow type="motion_goto_menu"><field name="TO">_random_</field></shadow></value>
- Conditions go in <value name="CONDITION"> with a boolean block, e.g. sensing_touchingobject with
  <value name="TOUCHINGOBJECTMENU"><shadow type="sensing_touchingobjectmenu"><field name="TOUCHINGOBJECTMENU">_mouse_</field></shadow></value>
- Variables: declare each new one first in <variables><variable type="" id="v1">score</variable></variables>,
  then use <field name="VARIABLE" id="v1" variabletype="">score</field>. Reuse existing variable names when they fit.
- Broadcasts: <field name="BROADCAST_OPTION" variabletype="broadcast_msg">name</field> inside event_broadcast_menu / event_whenbroadcastreceived.
- Only refer to costumes and sounds that exist in the sprite.
- Keep scripts simple and correct.`;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store'}
});

const extractXML = text => {
    const cleaned = String(text || '').replace(/```(?:xml)?/g, '');
    const start = cleaned.indexOf('<xml');
    const end = cleaned.lastIndexOf('</xml>');
    if (start === -1 || end === -1) return null;
    return cleaned.slice(start, end + 6);
};

export async function onRequestPost ({request, env}) {
    if (!env.AI) return json({error: 'Scratchity is not set up on this site yet (missing AI binding).'}, 500);

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({error: 'Bad request'}, 400);
    }
    const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT);
    if (!prompt) return json({error: 'Say what the code should do.'}, 400);

    const t = body.target || {};
    const list = v => (Array.isArray(v) ? v.slice(0, 50).map(String).join(', ') : '') || 'none';
    const context = `Sprite: ${t.name || 'Sprite1'}${t.isStage ? ' (this is the Stage — no motion blocks)' : ''}
Existing variables: ${list(t.variables)}
Existing lists: ${list(t.lists)}
Existing broadcasts: ${list(t.broadcasts)}
Costumes: ${list(t.costumes)}
Sounds: ${list(t.sounds)}`;

    try {
        const result = await env.AI.run(MODEL, {
            messages: [
                {role: 'system', content: SYSTEM},
                {role: 'user', content: `${context}\n\nWrite code that does this:\n${prompt}`}
            ],
            max_tokens: 2048,
            temperature: 0.2
        });
        const xml = extractXML(result && result.response);
        if (!xml) return json({error: 'The AI didn\'t return blocks. Try rewording it.'}, 502);
        return json({xml});
    } catch (e) {
        return json({error: `AI error: ${e.message || e}`}, 502);
    }
}

export function onRequestGet () {
    return json({ok: true, model: MODEL});
}

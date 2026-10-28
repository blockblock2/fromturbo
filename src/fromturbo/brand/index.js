// fromturbo branding that has to be applied at runtime (things that live inside scratch-vm).

import iconSVG from '!raw-loader!./icon.svg';

// White mark for use on coloured blocks and menu bubbles.
const MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">' +
    '<path fill="#ffffff" d="M4 12a4 4 0 0 1 4-4h4l3 3h7l3-3h7a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-7l-3 3h-7l-3-3h-4a4 4 0 0 1-4-4z"/>' +
    '<path fill="none" stroke="#1a6cf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" ' +
    'd="M13 14l5 5-5 5M21 14l5 5-5 5"/></svg>';

const toDataURI = svg => `data:image/svg+xml;base64,${btoa(svg)}`;

const MARK_URI = toDataURI(MARK_SVG);
const ICON_URI = toDataURI(iconSVG);

const BLUE = {color1: '#3d8bff', color2: '#2f74e0', color3: '#1f5cc2'};

/**
 * Rebrand the built-in "tw" extension (TurboWarp's extra blocks) without touching scratch-vm.
 * Block opcodes and behaviour are unchanged, so projects using these blocks keep working.
 */
const rebrandBuiltinBlocks = vm => {
    const em = vm.extensionManager;
    if (!em || !em.builtinExtensions || !em.builtinExtensions.tw || em.builtinExtensions.tw.fromturbo) return;
    const original = em.builtinExtensions.tw;
    const patched = () => {
        const Base = original();
        return class FromturboBlocks extends Base {
            getInfo () {
                const info = super.getInfo();
                return Object.assign({}, info, BLUE, {
                    name: 'fromturbo',
                    menuIconURI: MARK_URI,
                    blockIconURI: MARK_URI,
                    docsURI: null
                });
            }
        };
    };
    patched.fromturbo = true;
    em.builtinExtensions.tw = patched;
};

export {ICON_URI, MARK_URI, rebrandBuiltinBlocks};

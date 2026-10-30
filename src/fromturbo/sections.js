// The sections used in the extension library's filter bar and the little note on each card.

export const SECTIONS = {
    scratch: {tag: 'scratch', label: 'Scratch', note: 'Scratch · Extension'},
    turbowarp: {tag: 'turbowarp', label: 'TurboWarp', note: 'TurboWarp · Extension'},
    ftExtApproved: {tag: 'ft-ext-approved', label: 'fromturbo extensions ✓', note: 'fromturbo · Approved extension'},
    ftModApproved: {tag: 'ft-mod-approved', label: 'fromturbo mods ✓', note: 'fromturbo · Approved mod'},
    ftExtCommunity: {tag: 'ft-ext-community', label: 'Community extensions', note: 'fromturbo · Community extension'},
    ftModCommunity: {tag: 'ft-mod-community', label: 'Community mods', note: 'fromturbo · Community mod'}
};

// Filter-bar order.
export const SECTION_ORDER = ['scratch', 'turbowarp', 'ftExtApproved', 'ftModApproved', 'ftExtCommunity', 'ftModCommunity'];

/** Section for a community item from /api/mods ({kind, approved}). */
export const sectionFor = item => {
    if (item.kind === 'extension') return item.approved ? SECTIONS.ftExtApproved : SECTIONS.ftExtCommunity;
    return item.approved ? SECTIONS.ftModApproved : SECTIONS.ftModCommunity;
};

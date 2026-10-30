import {SECTIONS, SECTION_ORDER} from '../../fromturbo/sections';

// fromturbo: one filter button per section. These are names, so they aren't translated.
export default SECTION_ORDER.map(key => ({tag: SECTIONS[key].tag, intlLabel: SECTIONS[key].label}));

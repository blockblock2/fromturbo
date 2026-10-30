// fromturbo embeds are served from their own address, embed.fromturbo.pages.dev.
// Browsers keep each address's data separate, so nothing on the embed address can
// reach people's fromturbo editor (their mods, settings or sign-in). That's what makes
// it safe to run a project's custom extensions there automatically.

export const MAIN_SITE = 'https://fromturbo.pages.dev';
export const EMBED_SITE = 'https://embed.fromturbo.pages.dev';

const onEmbedHost = () => typeof location !== 'undefined' && /^embed\./i.test(location.hostname);

/** True only on the embed page of the embed address. */
export const autoRunExtensions = () => onEmbedHost() &&
    /\/embed(\.html)?$/i.test(location.pathname);

/** The editor and home page don't belong on the embed address: send people to the main site. */
export const leaveEmbedHost = () => {
    if (onEmbedHost() && !autoRunExtensions()) {
        location.replace(`${MAIN_SITE}${location.pathname}${location.search}${location.hash}`);
        return true;
    }
    return false;
};

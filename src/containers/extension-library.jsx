import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import log from '../lib/log';

import extensionLibraryContent, {
    galleryError,
    galleryLoading,
    galleryMore
} from '../lib/libraries/extensions/index.jsx';
import extensionTags from '../lib/libraries/tw-extension-tags';
import {SECTIONS, sectionFor} from '../fromturbo/sections';
import {fetchItems as fetchCommunity} from '../fromturbo/community';
import {BUILTIN_MOD_TILES, MOD_FALLBACK_TILE, itemTile} from '../fromturbo/brand/tiles';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    }
});

// fromturbo: which section each built-in card belongs to.
const builtinSection = extension => {
    if (extension.extensionId === 'tw') return SECTIONS.ftExtApproved; // fromturbo Blocks
    if ((extension.tags || []).includes('scratch')) return SECTIONS.scratch;
    return SECTIONS.turbowarp; // Custom Reporters, custom extensions, the extension gallery
};

const toLibraryItem = extension => {
    if (typeof extension === 'object') {
        const section = extension.section || builtinSection(extension);
        return ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension,
            tags: [section.tag],
            note: section.note
        });
    }
    return extension;
};

// fromturbo's own mods (Scratchity, Colab, .scratchpack) as cards.
const builtinModItems = () => {
    const ft = window.fromturbo;
    if (!ft) return [];
    return ft.mods.list().filter(m => m.builtIn)
        .map(m => ({
            name: m.name,
            description: m.enabled ? `${m.description} (On)` : m.description,
            extensionId: `ftmod-${m.id}`,
            builtinModId: m.id,
            iconURL: BUILTIN_MOD_TILES[m.id] || MOD_FALLBACK_TILE,
            section: SECTIONS.ftModApproved,
            featured: true
        }));
};

// Published community mods and extensions as cards.
const communityItems = items => items.map(item => ({
    name: item.name,
    description: item.description || ' ',
    extensionId: item.kind === 'extension' ? (item.extId || `community-${item.id}`) : `ftmod-community-${item.id}`,
    extensionURL: item.kind === 'extension' ? item.url : null,
    modURL: item.kind === 'mod' ? item.url : null,
    iconURL: itemTile(item),
    credits: item.author ? [`@${item.author}`] : [],
    section: sectionFor(item),
    incompatibleWithScratch: true,
    featured: true
}));

const inSection = section => item => item !== '---' && item.tags && item.tags[0] === section.tag;

const translateGalleryItem = (extension, locale) => ({
    ...extension,
    name: extension.nameTranslations[locale] || extension.name,
    description: extension.descriptionTranslations[locale] || extension.description
});

let cachedGallery = null;

const fetchLibrary = async () => {
    const res = await fetch('https://extensions.turbowarp.org/generated-metadata/extensions-v0.json');
    if (!res.ok) {
        throw new Error(`HTTP status ${res.status}`);
    }
    const data = await res.json();
    return data.extensions.map(extension => ({
        name: extension.name,
        nameTranslations: extension.nameTranslations || {},
        description: extension.description,
        descriptionTranslations: extension.descriptionTranslations || {},
        extensionId: extension.id,
        extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
        iconURL: `https://extensions.turbowarp.org/${extension.image || 'images/unknown.svg'}`,
        tags: ['turbowarp'],
        credits: [
            ...(extension.original || []),
            ...(extension.by || [])
        ].map(credit => {
            if (credit.link) {
                return (
                    <a
                        href={credit.link}
                        target="_blank"
                        rel="noreferrer"
                        key={credit.name}
                    >
                        {credit.name}
                    </a>
                );
            }
            return credit.name;
        }),
        docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
        samples: extension.samples ? extension.samples.map(sample => ({
            href: `${process.env.ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
            text: sample
        })) : null,
        incompatibleWithScratch: !extension.scratchCompatible,
        featured: true
    }));
};

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
        this.state = {
            gallery: cachedGallery,
            galleryError: null,
            galleryTimedOut: false,
            community: []
        };
    }
    componentDidMount () {
        fetchCommunity()
            .then(items => this.setState({community: items}))
            .catch(error => log.warn('community items', error));
        if (!this.state.gallery) {
            const timeout = setTimeout(() => {
                this.setState({
                    galleryTimedOut: true
                });
            }, 750);

            fetchLibrary()
                .then(gallery => {
                    cachedGallery = gallery;
                    this.setState({
                        gallery
                    });
                    clearTimeout(timeout);
                })
                .catch(error => {
                    log.error(error);
                    this.setState({
                        galleryError: error
                    });
                    clearTimeout(timeout);
                });
        }
    }
    handleItemSelect (item) {
        if (item.href) {
            return;
        }

        const extensionId = item.extensionId;

        // fromturbo mods are installed (or switched on) instead of added to the project.
        if (item.builtinModId || item.modURL) {
            const ft = window.fromturbo;
            if (!ft) return;
            const done = message => ft.ui.toast(message);
            if (item.builtinModId) {
                ft.mods.setEnabled(item.builtinModId, true);
                done(`${item.name} is on. Find it in the menu bar.`);
            } else if (ft.mods.urls().includes(item.modURL)) {
                done(`${item.name} is already installed.`);
            } else {
                ft.mods.loadURL(item.modURL)
                    .then(() => done(`Installed ${item.name}. Find it in the menu bar.`))
                    .catch(err => done(err.message));
            }
            this.props.onRequestClose();
            return;
        }

        if (extensionId === 'custom_extension') {
            this.props.onOpenCustomExtensionModal();
            return;
        }

        if (extensionId === 'procedures_enable_return') {
            this.props.onEnableProcedureReturns();
            this.props.onCategorySelected('myBlocks');
            return;
        }

        const url = item.extensionURL ? item.extensionURL : extensionId;
        if (!item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(extensionId)) {
                this.props.onCategorySelected(extensionId);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url)
                    .then(() => {
                        this.props.onCategorySelected(extensionId);
                    })
                    .catch(err => {
                        log.error(err);
                        // eslint-disable-next-line no-alert
                        alert(err);
                    });
            }
        }
    }
    render () {
        let library = null;
        if (this.state.gallery || this.state.galleryError || this.state.galleryTimedOut) {
            // fromturbo: grouped by section, with a line between each group.
            const builtins = extensionLibraryContent.map(toLibraryItem);
            const community = communityItems(this.state.community).map(toLibraryItem);
            const mods = builtinModItems().map(toLibraryItem);
            const groups = [
                builtins.filter(inSection(SECTIONS.scratch)),
                [
                    ...builtins.filter(inSection(SECTIONS.ftExtApproved)),
                    ...community.filter(inSection(SECTIONS.ftExtApproved))
                ],
                [...mods, ...community.filter(inSection(SECTIONS.ftModApproved))],
                community.filter(inSection(SECTIONS.ftExtCommunity)),
                community.filter(inSection(SECTIONS.ftModCommunity)),
                builtins.filter(inSection(SECTIONS.turbowarp))
            ].filter(g => g.length);
            library = [];
            for (const group of groups) {
                if (library.length) library.push('---');
                library.push(...group);
            }
            library.push('---');
            if (this.state.gallery) {
                library.push(toLibraryItem(galleryMore));
                const locale = this.props.intl.locale;
                library.push(
                    ...this.state.gallery
                        .filter(i => i.extensionId !== 'faceSensing')
                        .map(i => translateGalleryItem(i, locale))
                        .map(toLibraryItem)
                );
            } else if (this.state.galleryError) {
                library.push(toLibraryItem(galleryError));
            } else {
                library.push(toLibraryItem(galleryLoading));
            }
        }

        return (
            <LibraryComponent
                data={library}
                filterable
                persistableKey="extensionId"
                id="extensionLibrary"
                tags={extensionTags}
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onEnableProcedureReturns: PropTypes.func,
    onOpenCustomExtensionModal: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);

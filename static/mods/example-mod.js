// Example fromturbo mod.
// Install it: Mods → paste https://fromturbo.pages.dev/mods/example-mod.js → Install
// Or link people straight to: https://fromturbo.pages.dev/editor.html?mod=https://fromturbo.pages.dev/mods/example-mod.js

fromturbo.mods.register({
    id: 'example-sprite-counter',
    name: 'Sprite Counter',
    description: 'Adds a menu button that tells you how many sprites and blocks your project has.',
    author: 'you',

    run (api, {storage}) {
        const count = () => {
            const project = api.project.getJSON();
            const sprites = project.targets.filter(t => !t.isStage).length;
            const blocks = project.targets.reduce((n, t) => n + Object.keys(t.blocks).length, 0);
            const clicks = storage.get('clicks', 0) + 1;
            storage.set('clicks', clicks);
            api.ui.toast(`${sprites} sprites, ${blocks} blocks (you've checked ${clicks} times)`);
        };

        const removeButton = api.ui.addMenuButton('Count', count);

        // Listen to editor events
        const offFlag = api.on('greenFlag', () => console.log('Green flag clicked!'));

        // Returning a function lets fromturbo turn your mod off without a reload.
        return () => {
            removeButton();
            offFlag();
        };
    }
});

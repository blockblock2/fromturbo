# fromturbo

A fast Scratch editor with mods built in. fromturbo has everything TurboWarp has (the compiler that makes projects run fast, addons, dark mode, custom extensions), plus:

- **Scratchity**: describe what you want and it writes the blocks for you
- **Scratch Colab**: edit one project together, live
- **.scratchpack**: open and save your game archives
- **Mods**: change the editor itself, with a simple API anyone can use
- **Community mods and extensions**: browse, install and publish them
- **A Mac app** through BananaPeel

Website: **https://fromturbo.pages.dev** · Editor: **https://fromturbo.pages.dev/editor.html** · Modding guide: **https://fromturbo.pages.dev/mods/**

---

## Contents

1. [Getting fromturbo](#1-getting-fromturbo)
2. [The editor](#2-the-editor)
3. [Scratchity](#3-scratchity)
4. [Scratch Colab](#4-scratch-colab)
5. [.scratchpack](#5-scratchpack)
6. [The Mods panel](#6-the-mods-panel)
7. [The extension library and its sections](#7-the-extension-library-and-its-sections)
8. [Publishing mods and extensions](#8-publishing-mods-and-extensions)
9. [Approving (admins)](#9-approving-admins)
10. [Making a mod](#10-making-a-mod)
11. [Making an extension](#11-making-an-extension)
12. [Mod API reference](#12-mod-api-reference)
13. [The Mac app](#13-the-mac-app)
14. [Running the website](#14-running-the-website)
15. [How it's put together](#15-how-its-put-together)
16. [Privacy and safety](#16-privacy-and-safety)
17. [License](#license)

---

## 1. Getting fromturbo

| Way | What you get | How |
| --- | --- | --- |
| **Website** | Everything except publishing | Open https://fromturbo.pages.dev/editor.html |
| **Mac app (DMG)** | Everything, **including 🍌 Upload a mod and 🧩 Publish an extension** | `bananapeel dmg blockblock2/fromturbo-app`, then drag fromturbo into Applications |
| **Mac app (installed)** | Everything except publishing | `bananapeel install blockblock2/fromturbo-app`, or **Download** in the BananaPeel Store |

The BananaPeel Store also has a **💿 Download DMG** button that does the same as `bananapeel dmg`.

---

## 2. The editor

It's the normal Scratch editor with fromturbo's extras along the top menu bar:

| Button | What it opens |
| --- | --- |
| **Scratchity** | The AI block writer |
| **Colab** | Live collaboration |
| **Scratchpack** | .scratchpack archives |
| **Mods** | Your mods, community mods and extensions, publishing |

Everything else works like Scratch and TurboWarp: **File → Load from your computer / Save to your computer**, the green flag, costumes, sounds, and **Settings** (theme, accent colour, language). **Addons** turns TurboWarp's editor addons on and off; **Advanced** has the compiler, frame rate, turbo mode and stage size.

The default colour is blue. Change it in **Settings → Accent colour**.

---

## 3. Scratchity

**What it does:** you type what the code should do, and it builds the Scratch blocks in the sprite you have selected.

**How to use it:**

1. Select the sprite (or the Stage) you want code in.
2. Click **Scratchity** in the menu bar.
3. Type what you want, for example *"When the green flag is clicked, glide to a random spot forever and say hi when touching the mouse"*.
4. Press **Generate**. You see the blocks it wrote as text.
5. Press **Add to sprite**. The scripts appear in the code area, under anything that's already there.

**Download .sb3** saves the whole project.

**Good to know:**
- It knows the sprite's variables, lists, broadcasts, costumes and sounds, so it reuses them.
- If the AI makes up a block that doesn't exist, nothing is added and you're told which block was wrong. Just press Generate again or reword it.
- It runs on Qwen2.5-Coder through Cloudflare Workers AI, on the fromturbo website's account.

---

## 4. Scratch Colab

**What it does:** several people edit one project at the same time, without sharing it on Scratch.

**How to use it:**

1. Click **Colab**.
2. Paste a **Firebase Realtime Database URL** (`https://<project>-default-rtdb.firebaseio.com`). Everyone uses the same one.
3. Type your name and a **room code**.
4. The first person presses **Start room with my project**. Everyone else types the same room code and presses **Join room**.

The panel shows who's in the room. **Leave** disconnects you.

**How syncing works:** a second after someone stops editing, the whole project (with all costumes and sounds) is sent to the room, and everyone else gets it. If two people change things at the same moment, the last save wins, so it works best when people edit different sprites. Projects over 9 MB can't sync.

**Setting up the database** (once): in the Firebase console, create a Realtime Database and give it these rules:

```json
{ "rules": { "fromturbo-colab": { "$room": { ".read": true, ".write": true } } } }
```

Anyone with the room code can edit that room, so use codes that are hard to guess.

---

## 5. .scratchpack

**What it does:** works with `.scratchpack` and `.scratchplay` archives (the same format as scratchpack, scratchplay, scratchmerge and scratchshare).

**How to use it:** click **Scratchpack**, then:

| Button | What it does |
| --- | --- |
| **Open a pack** | Pick a `.scratchpack`, `.scratchplay` or `.zip`. Its games are listed, with a search box for big packs. Press **Open** on any game to load it into the editor. |
| **Save project as new pack** | Downloads a new `.scratchpack` containing the project you have open. |
| **Add project to open pack** | Adds the open project to the pack you opened and downloads the updated pack. |

Packs without a `manifest.json` still work: fromturbo finds the `.sb3` files inside.

---

## 6. The Mods panel

Click **Mods**. From top to bottom:

**Your mods.** Every mod you have, with a checkbox to turn it on or off. The built-in ones (Scratchity, Scratch Colab, .scratchpack) are marked **built-in**. Mods you installed have a **Remove** button.

**Community.** Mods and extensions other people published. Each one shows a small note saying which section it's in, its description, and who published it (their Scratch username).
- **Install** (mods): installs it; it loads every time you open fromturbo.
- **Add** (extensions): adds its blocks to the project you have open.
- In the DMG app: **🍌 Upload a mod** and **🧩 Publish an extension** (see [section 8](#8-publishing-mods-and-extensions)).

**Install a mod from a URL.** Paste a link to a mod's `.js` file and press **Install**.

**Add a custom extension.** Paste a link to an extension's `.js` file and press **Add**. Extensions from https://extensions.turbowarp.org work too.

**How to make a mod** links to the modding guide.

**Sharing a mod with a link:** send people `https://fromturbo.pages.dev/editor.html?mod=<link to the .js file>`. They're asked before it loads.

---

## 7. The extension library and its sections

Click the **Add Extension** button (bottom-left of the editor). Along the top is a filter button for each section, and **every card has a small note** above its name saying which section it's in.

| Section (filter button) | Note on the card | What's in it |
| --- | --- | --- |
| **Scratch** | Scratch · Extension | Scratch's own extensions (Pen, Music, Video Sensing…) |
| **TurboWarp** | TurboWarp · Extension | TurboWarp's extras (Custom Reporters, custom extensions) and TurboWarp's extension gallery |
| **fromturbo extensions ✓** | fromturbo · Approved extension | fromturbo Blocks, plus community extensions an admin approved |
| **fromturbo mods ✓** | fromturbo · Approved mod | Scratchity, Scratch Colab, .scratchpack, plus approved community mods |
| **Community extensions** | fromturbo · Community extension | Extensions anyone published that aren't approved yet |
| **Community mods** | fromturbo · Community mod | Mods anyone published that aren't approved yet |

**All** shows every section, grouped in that order with a line between groups.

Clicking a card:
- **an extension** adds its blocks to the project.
- **a mod** installs it (or switches a built-in mod back on) and closes the library. Look for its button in the menu bar.

---

## 8. Publishing mods and extensions

Publishing only works in the **DMG version of the Mac app** (see [section 13](#13-the-mac-app)).

1. Open **Mods**.
2. Press **🍌 Upload a mod** or **🧩 Publish an extension**.
3. The first time, your browser opens **Scratch Auth**. Sign in with your Scratch account, then come back to fromturbo. It remembers you.
4. Pick your `.js` file.

It appears straight away, for everyone, in the Mods panel and in the extension library.

**Rules:**
- A mod must contain a `fromturbo.mods.register({...})` call. An extension must contain a `Scratch.extensions.register(...)` call.
- Files can be up to 200 KB.
- The name and description shown come from `name:` and `description:` in your code.
- **It's credited to your Scratch username only**, never a real name. Anything like `author:` in the file is ignored.
- New items go into **Community** until an admin approves them.

The panel shows **Publishing as @yourname** with a **Sign out** link.

---

## 9. Approving (admins)

Admins are the Scratch usernames in `ADMINS` in `wrangler.toml` (by default **blockblock2**).

- Sign in through a publish button in the DMG app. The panel says **(admin)** next to your name.
- Every community item in the Mods panel gets an **Approve** button. Approving moves it into **fromturbo extensions ✓** or **fromturbo mods ✓**.
- Approved items get **Unapprove**, which moves them back to Community.
- **Anything an admin publishes is approved automatically.**

To add another admin, add their Scratch username to `ADMINS` (comma-separated) and deploy again.

---

## 10. Making a mod

A **mod** changes the editor: buttons, panels, tools. It's one `.js` file:

```js
fromturbo.mods.register({
    id: 'hello-button',           // unique, letters and dashes
    name: 'Hello Button',
    description: 'Adds a button that says hi.',
    run (api, {storage}) {
        const remove = api.ui.addMenuButton('Hello', () => api.ui.toast('Hi! 👋'));
        // Switching the mod off removes this button by itself, no reload needed.
        return remove;
    }
});
```

**Try it:** open the editor, press **⌘⌥J** (Chrome) or **⌘⌥C** (Safari) for the console, paste the code, press Enter. A **Hello** button appears.

**Share it:** publish it (section 8), host the file anywhere and share the `?mod=` link, or have people paste its link into **Install a mod from a URL**.

A bigger example is at https://fromturbo.pages.dev/mods/example-mod.js.

### Mod ideas

- A panel with a form: `api.ui.openPanel({title, render (body) { … }})`
- Do something on the green flag: `api.on('greenFlag', () => …)`
- Add generated code: `api.project.addBlocksXML('<xml>…</xml>')`
- Save something: `storage.set('key', value)` / `storage.get('key', fallback)`
- Add blocks without a separate file: `api.extensions.define(class { … })`

---

## 11. Making an extension

An **extension** adds new blocks. It's the standard Scratch/TurboWarp custom extension format, so it works in TurboWarp too:

```js
(function (Scratch) {
    'use strict';
    class MyBlocks {
        getInfo () {
            return {
                id: 'myblocks',                 // unique, letters and numbers only
                name: 'My Blocks',
                color1: '#ff8c1a',
                blocks: [
                    {
                        opcode: 'double',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'double [N]',
                        arguments: {N: {type: Scratch.ArgumentType.NUMBER, defaultValue: 5}}
                    },
                    {
                        opcode: 'isEven',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '[N] is even?',
                        arguments: {N: {type: Scratch.ArgumentType.NUMBER, defaultValue: 4}}
                    },
                    {
                        opcode: 'log',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'log [TEXT]',
                        arguments: {TEXT: {type: Scratch.ArgumentType.STRING, defaultValue: 'hello'}}
                    }
                ]
            };
        }
        double ({N}) { return Scratch.Cast.toNumber(N) * 2; }
        isEven ({N}) { return Scratch.Cast.toNumber(N) % 2 === 0; }
        log ({TEXT}) { console.log(TEXT); }
    }
    Scratch.extensions.register(new MyBlocks());
})(Scratch);
```

| Block type | Shape |
| --- | --- |
| `COMMAND` | A normal stack block |
| `REPORTER` | Round, gives back a value |
| `BOOLEAN` | Pointy, gives back true/false |
| `HAT` | Starts a script |

Argument types include `NUMBER`, `STRING`, `BOOLEAN`, `COLOR` and `ANGLE`.

**Try it:** **Mods → Add a custom extension** with a link to the file, or **Add Extension → Custom Extension**. Choose **Run without sandbox** if it needs to reach the editor. The full TurboWarp extension docs are at https://docs.turbowarp.org/development/extensions/introduction.

A bigger example is at https://fromturbo.pages.dev/mods/example-extension.js.

---

## 12. Mod API reference

Your mod's `run (api, {storage})` gets everything below. It's also on `window.fromturbo`.

### Project

| Call | What it does |
| --- | --- |
| `api.project.getJSON()` | The project as JSON (no costume or sound files) |
| `await api.project.getSb3()` | The whole project as an `.sb3` Blob |
| `await api.project.load(data, title?)` | Opens a project from an ArrayBuffer, Blob or project JSON |
| `api.project.getTitle()` / `setTitle(t)` | The project title |
| `api.project.editingTarget()` | The selected sprite (or Stage) |
| `await api.project.addBlocksXML(xml)` | Adds scripts (Scratch Blocks XML) to the selected sprite; rejects unknown blocks |

### Editor UI

| Call | What it does |
| --- | --- |
| `api.ui.addMenuButton(label, onClick)` | Adds a menu bar button; returns a function that removes it |
| `api.ui.openPanel({id, title, render (body, panel)})` | A floating, draggable panel; `panel.close()` closes it |
| `api.ui.toast(message)` | A short pop-up message |
| `api.ui.h(tag, props, ...children)` | Builds HTML elements. Classes `ft-btn`, `ft-quiet`, `ft-row`, `ft-muted`, `ft-item`, `ft-note` match fromturbo's look |
| `api.ui.activateTab(0, 1 or 2)` | Switches to Code, Costumes or Sounds |

### Events: `api.on(name, fn)` returns a function that stops listening

| Event | When |
| --- | --- |
| `projectChanged` | Anything in the project changed |
| `projectLoaded` | A project was opened through the API |
| `targetsUpdate` | Sprites changed, or another sprite was selected |
| `workspaceUpdate` | The code area was redrawn |
| `greenFlag` / `stop` | The project started or stopped |
| `blocksAdded` | Scripts were added with `addBlocksXML` |
| `modRegistered` / `modStarted` | Another mod appeared or started |

Mods can send their own events with `api.emit(name, ...args)`, so mods can talk to each other.

### Extensions

| Call | What it does |
| --- | --- |
| `await api.extensions.load(url)` | Adds an extension from a URL to the project |
| `api.extensions.define(Class)` | Adds blocks straight from your mod (the class gets the `Scratch` object) |
| `api.extensions.loaded()` | IDs of the extensions in the project |

### Mods

| Call | What it does |
| --- | --- |
| `api.mods.list()` | All mods, with name, description, on/off and whether they're built in |
| `api.mods.setEnabled(id, true or false)` | Turns a mod on or off |
| `await api.mods.loadURL(url)` | Installs a mod from a URL |
| `api.mods.urls()` | URLs of installed mods |

### Storage and the raw parts

| Call | What it does |
| --- | --- |
| `storage.get(key, fallback)` / `storage.set(key, value)` | Saved per mod, in the browser |
| `api.vm` | The Scratch VM (runtime, sprites, everything) |
| `api.blocks` / `api.workspace` | ScratchBlocks and the code area (after the Code tab has loaded) |
| `api.redux` | The editor's Redux store |
| `api.waitFor(check, timeout?)` | Waits until `check()` returns something truthy |

### Turning off without a reload

When a mod is switched off or removed, fromturbo undoes everything it added through `api` straight away: menu buttons, panels, `api.on` listeners, plus these helpers:

| Call | What it does |
| --- | --- |
| `api.every(ms, fn)` / `api.after(ms, fn)` | Like `setInterval` / `setTimeout`, stopped automatically |
| `api.addStyle(css)` | Adds CSS to the page, removed automatically |
| `api.onCleanup(fn)` | Runs `fn` on switch-off, for anything done outside `api` |

Returning a function from `run()` still works. Blocks from `api.extensions.define()` stay until the page reloads.

---

## 13. The Mac app

fromturbo runs as a real Mac app through [BananaPeel](https://www.npmjs.com/package/@blockblock2/bananapeel). The app is the `main` branch of **blockblock2/fromturbo-app**.

```bash
npm install -g @blockblock2/bananapeel
bananapeel key <your-cloudmersive-api-key>        # once; free at portal.cloudmersive.com
bananapeel dmg blockblock2/fromturbo-app          # DMG version (can publish)
bananapeel install blockblock2/fromturbo-app      # installed version (can't publish)
```

`bananapeel dmg` downloads the app, virus-scans it, builds `fromturbo-<version>.dmg` in Downloads on your own Mac and opens it, so macOS shows no "Apple could not verify" warning. Drag **fromturbo** onto **Applications**. To give it to someone, give them the command, not the DMG file.

In the Mac app:
- **Load / Save to your computer** use normal Mac Open and Save windows.
- Pop-ups use Mac dialogs; ⌘C, ⌘V and ⌘Z work in text boxes.
- Links to websites open in your browser (that's also how Scratch sign-in works).
- Scratchity, the Mods guide and community items use the fromturbo website, so they need internet.

**Updating the app:** after the website changes, copy the new `build/` into fromturbo-app, raise `version` in its `bananapeel.json`, push, then run `bananapeel dmg` again.

---

## 14. Running the website

The site is Cloudflare Pages (static files) plus Pages Functions (`functions/`). Everything is configured in `wrangler.toml`.

### Deploy

From a folder with `build/`, `functions/` and `wrangler.toml`:

```bash
wrangler pages deploy
```

### One-time setup

| What | Why | How |
| --- | --- | --- |
| Workers AI binding `AI` | Scratchity | Already in `wrangler.toml` |
| KV namespace `AUTH_KV` (fromturbo-auth) | Holds Scratch sign-ins for a few minutes | Already in `wrangler.toml` |
| Public repo `blockblock2/fromturbo-mods` | Stores community mods and extensions | Create on GitHub with a README |
| `GH_TOKEN` secret | Lets the site write to that repo | Fine-grained token, **Contents: Read and write** on that repo only: `wrangler pages secret put GH_TOKEN --project-name fromturbo` |
| `SESSION_SECRET` secret | Signs sign-in tokens | Any long random string: `wrangler pages secret put SESSION_SECRET --project-name fromturbo` |
| `ADMINS` | Who can approve | In `wrangler.toml`, comma-separated Scratch usernames |

### Building from source

```bash
npm ci --ignore-scripts
NODE_ENV=production npm run build      # output goes to build/
```

---

## 15. How it's put together

| Part | Where |
| --- | --- |
| Mod API and boot | `src/fromturbo/api.js`, `src/fromturbo/index.js` |
| Panels, buttons, toasts | `src/fromturbo/ui.js` |
| Built-in mods | `src/fromturbo/mods/` (scratchity, colab, scratchpack) |
| Community items, publishing, sign-in | `src/fromturbo/community.js` |
| Sections and card notes | `src/fromturbo/sections.js`, `src/containers/extension-library.jsx` |
| Logo, card pictures, block rebrand | `src/fromturbo/brand/` |
| Modding guide and examples | `static/mods/` |
| Scratchity backend | `functions/api/scratchity.js` |
| Scratch Auth sign-in | `functions/api/auth/[[path]].js`, `functions/api/_auth.js` |
| Community list, publishing, approving | `functions/api/mods/` |

**Website API** (used by the editor):

| Endpoint | What it does |
| --- | --- |
| `POST /api/scratchity` | Description → Scratch Blocks XML |
| `GET /api/mods` | Every community mod and extension (`kind`, `approved`, `author`, `url`…) |
| `GET /api/mods/<id>.js` | One item's code |
| `POST /api/mods` | Publish (signed in) |
| `POST /api/mods/approve` | Approve or unapprove (admins) |
| `/api/auth/start`, `/callback`, `/poll`, `/me` | Scratch Auth sign-in |

---

## 16. Privacy and safety

- **Mods and extensions can do anything** in the editor and to your project. Community items aren't checked by anyone until approved, so only install ones you trust.
- Publishing stores only your **Scratch username**, never a real name.
- Scratchity sends your description and the selected sprite's variable, costume and sound names to fromturbo's server and Cloudflare Workers AI. Nothing else from the project.
- Colab sends the whole project to the Firebase database you enter.
- Loading Scratch projects, cloud variables and the TurboWarp extension gallery use TurboWarp's servers.
- Full details: https://fromturbo.pages.dev/privacy.html

---

## License

fromturbo is a fork of [TurboWarp](https://github.com/TurboWarp/scratch-gui) and, like it, is licensed under the GNU General Public License v3.0. See LICENSE.

The default sprite, logo and icons are original fromturbo artwork.

The following is the original license for scratch-gui, which we are required to retain. This is NOT the license of this project.

```
Copyright (c) 2016, Massachusetts Institute of Technology
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```


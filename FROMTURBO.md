# fromturbo

A Scratch mod built on TurboWarp, with everything TurboWarp has plus:

- **Scratchity**: describe what you want and it writes the blocks into the selected sprite (Qwen2.5-Coder on Workers AI)
- **Scratch Colab**: edit one project together live through Firebase Realtime Database
- **Scratchpack**: open and save `.scratchpack` / `.scratchplay` archives
- **Mod API**: anyone can write a mod (`window.fromturbo`) and install it by URL; custom extensions in TurboWarp's format work too

Guide for modders: https://fromturbo.pages.dev/mods/

## Deploy to fromturbo.pages.dev

From this folder (the one with `wrangler.toml`, `build/` and `functions/`):

```bash
wrangler pages deploy
```

`wrangler.toml` already names the project `fromturbo`, points at `./build`, and binds Workers AI as `AI` for Scratchity. The first deploy will offer to create the `fromturbo` Pages project.

The editor is at `/editor.html`; `/` is TurboWarp's player/home page.

## Scratch Colab setup

Each person pastes a Firebase Realtime Database URL (`https://<project>-default-rtdb.firebaseio.com`) into the Colab panel. Rooms live under `/fromturbo-colab/<room>`. The database rules need to allow reads and writes there, for example:

```json
{
  "rules": {
    "fromturbo-colab": {
      "$room": { ".read": true, ".write": true }
    }
  }
}
```

Anyone with the room code can edit that room, so use codes that are hard to guess.

## Notes

- The micro:bit "update firmware" download is stubbed because the build environment couldn't fetch the firmware. Run `node scripts/prepublish.mjs` in `scratch-gui` with internet access, then rebuild, to restore it.
- fromturbo is a fork of TurboWarp and is licensed GPL-3.0. Its source must stay public.

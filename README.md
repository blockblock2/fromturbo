# fromturbo

A fast Scratch editor with built-in mods and a mod API:

- **Scratchity**: describe what you want and it writes the blocks into the selected sprite (Qwen2.5-Coder on Workers AI)
- **Scratch Colab**: edit one project together live through Firebase Realtime Database
- **Scratchpack**: open and save `.scratchpack` / `.scratchplay` archives
- **Mod API**: anyone can write a mod (`window.fromturbo`) and install it by URL; standard custom extensions work too

Guide for modders: https://fromturbo.pages.dev/mods/

## Deploy to fromturbo.pages.dev

From this folder (the one with `wrangler.toml`, `build/` and `functions/`):

```bash
wrangler pages deploy
```

`wrangler.toml` already names the project `fromturbo`, points at `./build`, and binds Workers AI as `AI` for Scratchity. The first deploy will offer to create the `fromturbo` Pages project.

The editor is at `/editor.html`; `/` is the player/home page.

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
- fromturbo is licensed GPL-3.0, so its source must stay public.

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


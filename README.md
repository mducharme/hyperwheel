# HyperWheel

A 3D wheel of names with switchable scenes, built with three.js `WebGPURenderer` and TSL node shaders. It falls back to WebGL2 automatically.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production bundle in dist/
```

**How to use:** click the wheel, press `Space`, or press `⌘/Ctrl+Enter` in the entries box to spin. You can also drag the wheel and let go to fling it. Switch scenes with the emoji dock at the top left. **Settings → Preview celebrations** plays any of the current scene's win animations without spinning. **Switch scene after each spin** (on by default) loads the next scene, in order or at random, when you dismiss the winner popup.

## Scenes

| | Scene | World | Celebrations (one is picked at random per win) |
|---|---|---|---|
| 🌆 | Neon Drive | striped retro sun, wireframe mountains, mirror grid floor | Laser Cannons · Fireworks Finale · Grid Quake · Outrun Flip |
| 🍭 | Sugar Rush | cotton-candy clouds, giant lollipops, gumdrops, candy-cane stand | Sprinkle Storm · Gumball Cannon · Jelly Wobble · Sugar Flip |
| 🐙 | Deep Sea | Worley-noise caustics, swaying kelp, god rays, marine snow, fog | Bubble Geyser · Fish Tornado · Jellyfish Bloom · Treasure Burst |
| 🪐 | Event Horizon | black hole with lensed accretion disk, ringed planet, GPU asteroid belt, zero-g wheel | Supernova · Warp Speed · Meteor Shower · Zero-G Tumble |

## Wheels, characters and your own audio

Everything is stored locally in your browser (IndexedDB). There's no account and no server.

- **Wheels:** the ⋯ menu next to the wheel name has New, Open, Duplicate, Export, Import, Share link and Delete.
  - **Autosave:** every change is saved automatically.
  - **Export** writes one `.hyperwheel` file (a zip) containing the names, settings and every uploaded model and audio file. Import it on another device to get the whole wheel back.
  - **Share link** puts the names, built-in characters and settings in the URL. Uploaded files can't fit in a link, so use Export for those.
- **Characters:** on the Entries tab, switch to **Characters** to pick a character for each name.
  - **Upload** rigged humanoid `.glb` (Draco and meshopt compression supported) or `.fbx` files. Mixamo rigs work best.
  - **Default:** names without a character get a built-in one, chosen by hashing the name so each name always keeps the same look.
  - **Winner reveal:** the winner's character is loaded while the wheel spins, then arrives with the scene's entrance (beam, pop, rise or teleport) and celebrates.
  - **How a character celebrates:**
    1. Its own dance clips: any clip whose name matches dance, salsa, flair, step, wave, cheer, emote-yes and so on.
    2. Dances borrowed from other Mixamo characters you've loaded this session.
    3. A code-driven routine (cheer, jumping jacks, wave, spin-hop, dab) that aims each limb at a target direction, so it works with T-pose, A-pose or blocky rigs.
- **Your audio:** Settings → *This wheel's music* takes uploaded spin tracks and a win sound. They're saved with the wheel, included in exports, and take priority over the scene's music.

### Built-in characters

`public/characters/kenney/` holds [Kenney's Blocky Characters](https://kenney.nl/assets/blocky-characters) (CC0). To add a pack, put the GLBs under `public/characters/<pack>/` and list them in `src/characters/catalog.ts`.

## Music (ElevenLabs)

Each scene has 3 spin tracks and 1 win sting. They're listed with their prompts in [`src/themes/music.json`](src/themes/music.json).

```sh
export ELEVENLABS_API_KEY=...
npm run music:dry                    # list what would be generated
npm run music                        # generate every missing track
node scripts/generate-music.mjs abyss --force   # redo one scene
```

Files go to `public/music/<scene>/` and are loaded automatically. Each spin picks a random track, never the same one twice in a row, and the music winds down like a turntable losing power as the wheel stops. **Before you generate anything**, each scene plays its own procedurally generated chiptune instead (`audio/ChipSynth.ts`), so the app is never silent. You can also drop in your own `.mp3` files using the same names.

## Architecture

```
src/
  main.ts            boot: App + UI
  app/               App (frame loop, spin flow, theme switching), UI modules (session, wheel menu,
                     entries/characters view, audio panel), DragSpin, prefs store
  library/           IndexedDB, content-addressed assets, wheel documents, .hyperwheel export/import, share links
  characters/        loaders (glTF/Draco/meshopt/FBX), rig mapping, Performer (clips + procedural moves),
                     Showcase (themed entrances), thumbnails, built-in catalog
  engine/            Stage (renderer + post: ripple, bloom, aberration, flash), CameraRig, physics, globals
  wheel/             Wheel (geometry, canvas-painted names, uniform-driven styling), Pointer (flapper)
  fx/                FxDirector + reusable GPU effects: Particles, Shockwave, Stunts, atlas sprite kit
  audio/             AudioBus, Sfx (themed ticks), Music (tracks + fallback), ChipSynth
  themes/
    types.ts         the Theme contract
    shared.ts        floor / stand / lights helpers
    music.json       tracks + ElevenLabs prompts
    <scene>/index.ts one self-contained scene each
```

- **Theme contract** (`themes/types.ts`): wheel styling (palette, font, rim, LEDs…), post-processing settings, camera framing, tick sound, a chiptune recipe, `createScene()` to build the world, and `celebrations()` for the win animations. Switching scenes disposes everything the old one created.
- **Particles** (`fx/Particles.ts`): every trajectory is a closed-form function of time evaluated in the vertex shader: ballistic motion with drag, wobble, 3D tumbling, or streaks that stretch along their velocity. Each scene draws its own sprite atlas with a small canvas shape kit. All per-particle data is packed into one interleaved instance buffer, because WebGPU allows at most 8 vertex buffers per pipeline.
- **Celebrations** are built when the scene loads and run later. A celebration's `setup(fx)` creates its effects, so their shaders compile with the scene, and returns the function that plays them. The `FxDirector` gives them particles, shockwaves, a screen ripple, flashes, chromatic aberration, camera shake/orbit/zoom, wheel stunts (flip, hop, jelly, tumble…) and timers.
- **Fair results:** the spin's total angle is chosen in advance as base turns plus a uniformly random fraction of a turn, then the drag-plus-friction motion is solved to land exactly there. Every slice is equally likely, even when you fling the wheel.

### Adding a scene

1. Create `src/themes/<id>/index.ts` and export a `Theme`. Copy an existing scene as a starting point.
2. Register it in `src/themes/index.ts`.
3. Add its wheel font to the Google Fonts link in `index.html`.
4. Optionally add tracks to `music.json` and run `npm run music <id>`.

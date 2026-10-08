# LocoSpin

A 3D wheel of names with 20 animated scenes, characters and music, built with three.js `WebGPURenderer` and TSL node shaders. It falls back to WebGL2 automatically.

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + production bundle in dist/
npm run preview      # serve the production build
```

## Using it

- **Spin:** click the wheel, press `Space`, press `⌘/Ctrl+Enter` in the names box, or drag the wheel and let go to fling it. Spins last 20 seconds by default (Settings → Spin duration, 3–20 s).
- **Scenes:** every page load starts in a random scene, and every spin switches to another random one. The dock at the top left shows the current scene (tap it for the gallery of all 20) and 🎡 for Your wheels.
- **Winner:** the winner's character arrives with the scene's entrance and celebrates. The popup can remove the winner from the wheel.
- **Settings (⚙):**
  - Preview celebrations (plays the current scene's win animations without spinning);
  - Spin duration and Character packs;
  - Music and Sound effects;
  - Graphics quality (Auto, High, Medium, Low);
  - Debug info.

## Scenes

| | Scene | World | Celebrations (one is picked at random per win) |
|---|---|---|---|
| 🌆 | Neon Drive | striped retro sun, wireframe mountains, mirror grid floor | Laser Cannons · Fireworks Finale · Grid Quake · Outrun Flip |
| 🍭 | Sugar Rush | cotton-candy clouds, giant lollipops, gumdrops | Sprinkle Storm · Gumball Cannon · Jelly Wobble · Sugar Flip |
| 🐙 | Deep Sea | caustics, swaying kelp, god rays, marine snow | Bubble Geyser · Fish Tornado · Jellyfish Bloom · Treasure Burst |
| 🪐 | Event Horizon | lensed black hole, ringed planet, asteroid belt, zero-g wheel | Supernova · Warp Speed · Meteor Shower · Zero-G Tumble |
| 🎃 | Haunted | moonlit graveyard, ground fog, jack-o'-lanterns, wisps | Bat Swarm · Ghost Parade · Trick or Treat · Thunderstrike |
| ❄️ | Winter | aurora, snowy pines with fairy lights, snowmen | Snowball Fight · Present Drop · Blizzard · Aurora Surge |
| 🌴 | Tiki Island | sunset beach, palms, tiki totems and torches, a volcano | Coconut Cannon · Flower Lei Shower · Fire Dance · Volcano Eruption |
| 🎙️ | Prime Time | LED stage and wall, sweeping spotlights, a studio audience | Ticker-Tape Finale · Confetti Cannons · Jackpot · Standing Ovation |
| 🏁 | Grand Prix | floodlit night race, tail-light trails, a cheering grandstand | Chequered Flag · Champagne Spray · Burnout · Victory Lap |
| 🏴‍☠️ | Pirate Cove | a ship's deck at night, moonlit sea, lanterns, a lighthouse | Cannon Volley · Treasure Trove · Release the Kraken · Jolly Roger |
| 💎 | Crystal Caverns | glowing geodes and crystal veins, a mine cart track | Crystal Shatter · Gem Shower · Mine Cart Rush · Geode Glow |
| 🦖 | Dino Valley | jungle at dusk, a smoking volcano, long-necks, fireflies | T-Rex Roar · Egg Hatch · Stampede · Pterodactyl Flock |
| 🤠 | Wild West | a frontier street at sunset, lamplit saloons, tumbleweeds | Yee-Haw! · Gold Rush · Dynamite · Tumbleweed Stampede |
| 🌸 | Zen Garden | twilight, raked sand, a koi pond, paper and stone lanterns | Petal Storm · Lantern Rise · Koi Leap · Gong |
| 🌃 | Neo Tokyo | rain, neon signs, flying cars | Sign Overload · Drone Swarm · Puddle Splash · Thunderstorm |
| 🏺 | Desert Pharaoh | moonlit pyramids, glowing hieroglyphs, fire bowls | Sandstorm · Scarab Swarm · Eye of Ra · Pharaoh's Gold |
| 🎈 | Sky Islands | floating islands at golden hour, kites, sheep, an airship | Balloon Release · Rainbow Bridge · Bird Flock · Cloud Burst |
| ⚗️ | Mad Lab | Tesla coils, potion shelves, a brain in a jar | Lightning Arc · Potion Explosion · It's Alive! · Bubble Overflow |
| 👾 | Pixel Arcade | pixel sunset, voxel hills, mystery blocks, shelled critters | Coin Shower · 1-UP · Pixel Explosion · Power-Up |
| 🍕 | Pizza Party | evening trattoria, wood-fired oven, string lights | Topping Rain · Dough Toss · Oven Blast · Mamma Mia |

Every scene has its own wheel styling (rim, pegs, pointer and font; for example a racing tire, a ship's helm, a pizza crust or a voxel rim), its own peg tick sound, and a few idle moments that play now and then while the wheel is still.

## Wheels and links

Everything is stored in the browser (IndexedDB). There's no account and no server. The app asks the browser to keep this storage permanently. If the browser blocks storage entirely, the app still runs but says nothing will be saved.

- **Wheels:** the ⋯ menu next to the wheel name has New, Open, Duplicate, Export, Import, Share link and Delete. Every change is saved automatically.
- **Export** writes one `.locospin` file (a zip) with the names, settings and every uploaded model. Import it on another device to get the whole wheel back. Older `.hyperwheel` files still import.
- **Share link** puts the names, built-in characters and settings in the URL (`#w=…`). Uploaded models can't fit in a link, so use Export for those.
- **URLs:**
  - `/<preset>` opens a preset wheel (see below).
  - `#<scene>` starts in that scene instead of a random one, for example `/#zen` or `/team#pizza`. Scene ids are the folder names in `src/themes/`.

### Preset wheels

Preset wheels are `.locospin` files bundled into the site at build time. They show at the top of Your wheels with a 📌, can't be deleted, and are reachable at `/<file name without .locospin>`.

- **Fresh every time:** opening a preset, by link or from the list, starts from the original file: all its names, no results. Clicking the open preset again resets it.
- **Fast start:** a preset link shows the names immediately, downloads the full file (with its characters) in the background with a progress toast, then swaps it in, keeping any spins made meanwhile.
- **Source:** set `PRESET_WHEELS_URL` (in `.env` locally, in the Vercel project's environment variables for deploys) to a folder that serves the files and an `index.json` listing them: `["team.locospin", "ops.locospin"]`. An S3 bucket with public read on that folder works; only the build downloads from it. Without the variable, a `presets/` folder in the repo is used if it exists.
- **File names:** letters, digits, `-` and `_` only, since the name is also the URL.
- **Updating:** changing presets needs a rebuild and redeploy.

## Characters

On the Entries tab, switch to **Characters** to pick a character for each name. The picker has a search box.

- **Upload** rigged humanoid `.glb` (Draco and meshopt compression supported) or `.fbx` files. Mixamo rigs work best.
- **Default:** names without a character get a built-in one from the enabled packs, chosen by hashing the name so each name always keeps the same look.
- **Winner reveal:** the winner's character loads while the wheel spins, then arrives with the scene's entrance (beam, pop, rise or teleport) and celebrates.
- **How a character celebrates:**
  1. Its own dance clips: any clip whose name matches dance, salsa, flair, step, wave, cheer, emote-yes and so on (`jump-attack` is excluded).
  2. Dances borrowed from other Mixamo characters loaded this session.
  3. A code-driven routine (cheer, jumping jacks, wave, spin-hop, dab) that aims each limb at a target direction. It reads the rig's rest pose and facing, so it works with T-pose, A-pose and blocky rigs, and with Blender-style bone names such as `upperarm.l`.
- **Imported models:** models that arrive inside an imported file or preset are removed again once no wheel uses them. Models you upload yourself stay until you delete them in the picker.
- **Debug:** with Debug info on, the console explains each character's rig mapping, its clips and why it's doing what it does.

### Built-in character packs

Packs are switched on and off in Settings → Character packs. All packs are CC0 (public domain).

| Pack | Characters | Source | On by default |
|---|---|---|---|
| Adventurers | 6 | [KayKit Adventurers](https://kaylousberg.itch.io/kaykit-adventurers), with the jump clips from its shared animation files | yes |
| Blocky | 18 | [Kenney Blocky Characters](https://kenney.nl/assets/blocky-characters) | yes |

The KayKit files were optimized with [gltf-transform](https://gltf-transform.dev) (WebP textures and meshopt compression), so each character is about 140 KB.

**To add a pack:** put the GLBs under `public/characters/<pack>/` and add a `CharacterPack` to `src/characters/catalog.ts`. A pack can also declare:
- `parts`: extra skinned meshes bound to the skeleton, like hairstyles;
- `animations`: extra files whose clips are merged in;
- `celebrations`: which clips to celebrate with.

## Music (ElevenLabs)

Each scene has 6 spin songs and 5 win stings, 220 tracks in all. They're listed with their prompts in [`src/themes/music.json`](src/themes/music.json). The ElevenLabs key lives in `.env` and is only used by this script. It's never bundled into the site, so don't add it to Vercel.

```sh
npm run music:dry                          # list what would be generated
npm run music                              # generate every missing track
npm run music -- candy                     # one scene (missing tracks only)
npm run music -- synthwave/spin-3          # regenerate exactly this track
npm run music -- candy --force             # regenerate a whole scene
npm run music -- --force --kind=spin       # regenerate every spin song
```

Files go to `public/music/<scene>/` and are loaded automatically.
- **Spin songs:** each spin plays a random song from the current scene, never the same one twice in a row, and it winds down like a turntable losing power as the wheel stops.
- **Win stings:** each win plays a random sting.
- **Before tracks exist:** a scene plays its own procedural chiptune (`audio/ChipSynth.ts`), and a synth fanfare stands in for the stings, so the app is never silent.

**Levels:**
- **Loudness:** tracks are evened out when they're decoded. Each keeps half of its own loudness difference, within ±2.5 dB of a shared target, so the set spans about 5 dB instead of up to 17 (`KEEP` and `MAX_DEVIATION_DB` in `audio/Music.ts`).
- **Win and ticks:** `WIN_GAIN` in `audio/AudioBus.ts` sets the win sound relative to the music, and `TICK_GAIN` in `audio/Sfx.ts` sets the peg ticks.

**iOS:** the audio session is declared as playback, so sound plays even with the silent switch on (iOS 16.4+). Audio unlocks on the first tap anywhere and recovers after calls or app switches.

## Performance, motion and accessibility

- **Graphics quality** controls render resolution and bloom quality. **Auto**, the default, starts at Medium on touch devices and High elsewhere, steps down when spins stutter, and tries a step up after smooth spins. The level is remembered per device.
- **Idle:** when nothing is moving, the frame rate is capped at 30 fps.
- **Lazy loading:** scenes load on demand (each is its own chunk) and the rest are fetched in the background after the first frame. Soft sky effects render at reduced resolution.
- **Reduced motion:** when the OS "reduce motion" setting is on:
  - no camera shake or orbit, and gentler zoom and sway;
  - no chromatic-aberration pulses, and softer ripples;
  - flashes are dim and at least half a second apart, and lightning is a single soft swell;
  - the scenes' fast strobes slow down.
- **Unsupported browsers:** without WebGPU or WebGL2, the loading screen explains what's needed instead of spinning forever.
- **Debug mode:** `?debug` (sticky; `?debug=0` turns it off) or Settings → Debug info shows the renderer and FPS badges. It also logs the music picked, celebrations, character rigs and animations to the console.

## Deploying (Vercel)

`vercel.json` builds with `npm run build` and serves `dist/`. It also:
- caches `/assets`, `/characters` and `/music` with long cache headers;
- rewrites single-segment paths (`/team`) to the app, for preset links.

Set `PRESET_WHEELS_URL` in the project's environment variables if you use presets. Security headers (CSP and friends) are managed in the Vercel project, not in this repo. After changing them, check that WebGPU, Google Fonts and the music still load.

## Architecture

```
src/
  main.ts            boot: renderer, UI, error screens, background prefetch
  debug.ts           ?debug flag and console helpers
  app/               App (frame loop, spin flow, theme switching, idle cap), UI (dock, gallery, settings,
                     winner), session (open wheel, autosave, preset stand-in), route (/<preset>, #<scene>),
                     wheel menu + Your wheels, entries/characters view, DragSpin, prefs store
  library/           IndexedDB (with an in-memory fallback), content-addressed assets, wheel documents,
                     .locospin export/import, share links, presets, input limits and validation
  characters/        loaders (glTF/Draco/meshopt/FBX), rig mapping, Performer (clips + procedural moves),
                     Showcase (themed entrances), thumbnails, built-in catalog
  engine/            Stage (renderer + post: ripple, bloom, aberration, flash), CameraRig, physics,
                     quality levels + Auto, reduced motion, shared shader uniforms
  wheel/             Wheel (geometry, canvas-painted names, per-scene decorations), Pointer (flapper),
                     Attract (idle nudges)
  fx/                FxDirector + reusable GPU effects: Particles, Shockwave, Stunts, ambient idle moments,
                     atlas sprite kit, shared TSL nodes
  audio/             AudioBus, Sfx (themed ticks), Music (tracks, loudness, fallback), ChipSynth
  themes/
    index.ts         scene registry (auto-discovers folders)
    types.ts         the Theme contract
    shared.ts        floor / stand / lights / tube helpers
    fonts.ts         loads each scene's wheel font on demand
    music.json       tracks + ElevenLabs prompts
    <scene>/         meta.ts, index.ts, celebrations.ts, sprites.ts, optional layout.ts
scripts/
  generate-music.mjs ElevenLabs track generator
  presetWheels.ts    Vite plugin that bundles preset wheels at build time
```

- **Theme contract** (`themes/types.ts`):
  - wheel styling (palette, font, rim, pins, pointer and decorations…);
  - post-processing, camera framing, tick sound, a chiptune recipe and the character's spot and entrance;
  - `createScene()` to build the world, and `celebrations()` for the win animations.

  Switching scenes disposes everything the old one created.
- **Particles** (`fx/Particles.ts`): every trajectory is a closed-form function of time, evaluated in the vertex shader. Particles can follow ballistic motion with drag, wobble, tumble in 3D, or stretch along their velocity. Each scene draws its own sprite atlas. All per-particle data is packed into one interleaved instance buffer, because WebGPU allows at most 8 vertex buffers per pipeline.
- **Celebrations** are built when the scene loads and run later. A celebration's `setup(fx)` creates its effects, so their shaders compile with the scene, and returns the function that plays them. The `FxDirector` gives them:
  - particles, shockwaves, a screen ripple, flashes and chromatic aberration;
  - camera shake, orbit and zoom;
  - wheel stunts (flip, hop, jelly, tumble…) and timers.
- **Fair results:** the spin's total angle is chosen in advance as base turns plus a uniformly random fraction of a turn. The drag-plus-friction motion is then solved to land exactly there, so every slice is equally likely, even when you fling the wheel.

### Adding a scene

1. Create `src/themes/<id>/` with:
   - `meta.ts`, exporting `meta` with an `id` that matches the folder name, plus name, emoji, tagline, colours, `order` and wheel font;
   - `index.ts`, exporting a `Theme` named after the id;
   - `celebrations.ts` and `sprites.ts`.

   Copy an existing scene as a starting point.
2. That's all for registration: `themes/index.ts` finds the folder automatically, and the wheel font is loaded from Google Fonts on first use.
3. Optionally add tracks to `music.json` and run `npm run music -- <id>`.

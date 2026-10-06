#!/usr/bin/env node
/**
 * Generate spin music and win stings with the ElevenLabs Music API.
 *
 *   npm run music                          # everything missing (reads ELEVENLABS_API_KEY from .env)
 *   npm run music -- candy                 # one theme (missing tracks only)
 *   npm run music -- synthwave/spin-3      # regenerate exactly this track (replaces it)
 *   npm run music -- candy/win-2 abyss/spin-5   # several specific tracks
 *   npm run music:dry                      # list what would be made
 *   npm run music -- candy --force         # regenerate a whole theme
 *   npm run music -- --force --kind=spin   # regenerate every spin song (keep the win stings)
 *
 * Replaced files are moved to .music-history/<theme>/ (git-ignored, never
 * deployed), so a worse take can be rolled back by copying the old file back.
 *
 * Tracks, prompts and lengths live in src/themes/music.json (shared with the app).
 * Files land in public/music/<theme>/ and are picked up automatically; any
 * track that's missing falls back to the theme's procedural chiptune.
 */
import { readFile, writeFile, mkdir, access, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const targets = args.filter((a) => !a.startsWith('--'));
const kindArg = args.find((a) => a.startsWith('--kind='))?.split('=')[1];
if (kindArg && !['spin', 'win'].includes(kindArg)) {
  console.error('--kind must be "spin" or "win"');
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(root, 'src/themes/music.json'), 'utf8'));

// "theme" selects a whole theme; "theme/track" (with or without .mp3) selects one track and replaces it
const themes = new Set();
const tracks = new Set();
for (const t of targets) {
  const [theme, name] = t.split('/');
  if (!manifest[theme]) fail(`Unknown theme "${theme}". Themes: ${Object.keys(manifest).join(', ')}`);
  if (!name) {
    themes.add(theme);
    continue;
  }
  const file = name.endsWith('.mp3') ? name : `${name}.mp3`;
  const all = [...manifest[theme].spin, ...manifest[theme].win].map((x) => x.file);
  if (!all.includes(file)) fail(`No track "${theme}/${name}". ${theme} has: ${all.map((f) => f.replace('.mp3', '')).join(', ')}`);
  tracks.add(`${theme}/${file}`);
}
const selected = (theme, file) => !targets.length || themes.has(theme) || tracks.has(`${theme}/${file}`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dryRun) {
  console.error('No ELEVENLABS_API_KEY: put it in .env (see .env.example) or export it, or pass --dry-run.');
  process.exit(1);
}

const exists = (p) =>
  access(p).then(
    () => true,
    () => false,
  );

let made = 0;
let skipped = 0;
for (const [theme, groups] of Object.entries(manifest)) {
  for (const [kind, list] of Object.entries(groups)) {
    if (kindArg && kind !== kindArg) continue;
    for (const t of list) {
      if (!selected(theme, t.file)) continue;
      const out = join(root, 'public/music', theme, t.file);
      const replace = force || tracks.has(`${theme}/${t.file}`);
      if (!replace && (await exists(out))) {
        skipped++;
        continue;
      }
      const ms = Math.round((t.seconds ?? 30) * 1000);
      console.log(`${dryRun ? '[dry-run] ' : ''}${theme}/${t.file} (${kind}, ${ms / 1000}s)\n  “${t.prompt}”`);
      if (dryRun) continue;

      const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.prompt,
          music_length_ms: Math.max(3000, ms),
          force_instrumental: true,
        }),
      });
      if (!res.ok) {
        console.error(`  ✗ ${res.status} ${await res.text()}`);
        continue;
      }
      const audio = Buffer.from(await res.arrayBuffer());
      await mkdir(dirname(out), { recursive: true });
      if (await exists(out)) {
        // keep the previous take out of the deployed folder, in case the new one is worse
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const old = join(root, '.music-history', theme, t.file.replace('.mp3', `-${stamp}.mp3`));
        await mkdir(dirname(old), { recursive: true });
        await rename(out, old);
        console.log(`  ↺ previous take kept at ${old.replace(root + '/', '')}`);
      }
      await writeFile(out, audio);
      console.log(`  ✓ saved ${out.replace(root + '/', '')}`);
      made++;
    }
  }
}
console.log(`\nDone: ${made} generated, ${skipped} already present${skipped ? ' (name a track like synthwave/spin-3 to redo it)' : ''}.`);

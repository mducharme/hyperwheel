#!/usr/bin/env node
/**
 * Generate spin music and win stings with the ElevenLabs Music API.
 *
 *   ELEVENLABS_API_KEY=... node scripts/generate-music.mjs            # everything missing
 *   ELEVENLABS_API_KEY=... node scripts/generate-music.mjs candy      # one theme
 *   node scripts/generate-music.mjs --dry-run                          # list what would be made
 *   ... --force                                                         # regenerate existing files
 *
 * Tracks, prompts and lengths live in src/themes/music.json (shared with the app).
 * Files land in public/music/<theme>/ and are picked up automatically; any
 * track that's missing falls back to the theme's procedural chiptune.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));

const manifest = JSON.parse(await readFile(join(root, 'src/themes/music.json'), 'utf8'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dryRun) {
  console.error('Set ELEVENLABS_API_KEY (or pass --dry-run).');
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
  if (only.length && !only.includes(theme)) continue;
  for (const [kind, tracks] of Object.entries(groups)) {
    for (const t of tracks) {
      const out = join(root, 'public/music', theme, t.file);
      if (!force && (await exists(out))) {
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
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      console.log(`  ✓ saved ${out.replace(root + '/', '')}`);
      made++;
    }
  }
}
console.log(`\nDone: ${made} generated, ${skipped} already present${force ? '' : ' (use --force to redo)'}.`);

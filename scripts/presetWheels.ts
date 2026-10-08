/**
 * Preset wheels: .locospin files bundled into the site at build time.
 *
 * They're read from `PRESET_WHEELS_URL` (any static host: an S3 bucket, a CDN,
 * a GitHub raw folder…) which must serve an `index.json` listing the files —
 * either `["team.locospin", …]` or `{ "wheels": [ … ] }` — next to the files
 * themselves. Without the variable, `presets/*.locospin` in the repo is used.
 *
 * The site gets `presets/index.json` (file, title, number of names, scene) and
 * the files under `presets/`, so nothing is fetched from the bucket at runtime:
 * no CORS setup, and the presets keep working if the bucket is down.
 */
import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

// letters, digits, - and _ only: the name (without .locospin) is also the preset's URL path
const FILE = /^[\w-]+\.locospin$/;
const MAX_BYTES = 64 * 1024 * 1024;
const LOCAL_DIR = 'presets';

export interface PresetInfo {
  file: string;
  title: string;
  names: number;
  /** The names themselves, so the app can show the wheel before the file (with its models) has downloaded. */
  entries: string[];
  theme?: string;
}

async function fetchRemote(url: string) {
  const base = url.endsWith('/') ? url : `${url}/`;
  const res = await fetch(new URL('index.json', base));
  if (!res.ok) throw new Error(`${base}index.json → HTTP ${res.status}`);
  const index: unknown = await res.json();
  const list: unknown[] = Array.isArray(index) ? index : Array.isArray((index as { wheels?: unknown })?.wheels) ? (index as { wheels: unknown[] }).wheels : [];
  const files = new Map<string, Uint8Array>();
  for (const name of list) {
    if (typeof name !== 'string' || !FILE.test(name)) {
      console.warn(`[presets] skipping ${JSON.stringify(name)}: expected a file name like team-standup.locospin (letters, digits, - and _)`);
      continue;
    }
    const r = await fetch(new URL(name, base));
    if (!r.ok) throw new Error(`${base}${name} → HTTP ${r.status}`);
    files.set(name, new Uint8Array(await r.arrayBuffer()));
  }
  return files;
}

async function readLocal() {
  const files = new Map<string, Uint8Array>();
  if (!existsSync(LOCAL_DIR)) return files;
  for (const name of (await readdir(LOCAL_DIR)).sort()) if (FILE.test(name)) files.set(name, new Uint8Array(await readFile(`${LOCAL_DIR}/${name}`)));
  return files;
}

/** Title, names and scene from a file's wheel.json (the full import and validation happen in the browser). */
function describe(file: string, bytes: Uint8Array): PresetInfo | null {
  if (bytes.length > MAX_BYTES) {
    console.warn(`[presets] skipping ${file}: larger than ${MAX_BYTES / 1024 / 1024} MB`);
    return null;
  }
  try {
    const raw = unzipSync(bytes, { filter: (f) => f.name === 'wheel.json' })['wheel.json'];
    const manifest = JSON.parse(strFromU8(raw));
    const w = manifest?.wheel ?? {};
    // 'hyperwheel' is the format tag from before the rename
    if (manifest?.format !== 'locospin' && manifest?.format !== 'hyperwheel') throw new Error('not a LocoSpin file');
    return {
      file,
      title: String(w.title ?? file.replace(/\.locospin$/, '')).slice(0, 60),
      names: Array.isArray(w.entries) ? w.entries.length : 0,
      entries: (Array.isArray(w.entries) ? w.entries : []).map((e: { name?: unknown }) => String(e?.name ?? '').slice(0, 120)).filter(Boolean).slice(0, 500),
      theme: typeof w.settings?.theme === 'string' ? w.settings.theme : undefined,
    };
  } catch (err) {
    console.warn(`[presets] skipping ${file}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export function presetWheels(url: string | undefined): Plugin {
  let files = new Map<string, Uint8Array>();
  let index: PresetInfo[] = [];
  let ready: Promise<void> | null = null;

  const collect = async () => {
    const all = url ? await fetchRemote(url) : await readLocal();
    index = [];
    files = new Map();
    for (const [name, bytes] of all) {
      const info = describe(name, bytes);
      if (!info) continue;
      index.push(info);
      files.set(name, bytes);
    }
    console.info(`[presets] ${index.length} preset wheel${index.length === 1 ? '' : 's'} from ${url ?? `./${LOCAL_DIR}`}`);
  };

  return {
    name: 'locospin-presets',
    async buildStart() {
      ready = collect();
      await ready;
    },
    configureServer(server) {
      // dev: serve the same files the build will emit; a bad URL only warns, so the dev server still starts
      server.middlewares.use('/presets', async (req, res, next) => {
        try {
          await (ready ??= collect());
        } catch (err) {
          console.warn(`[presets] ${err instanceof Error ? err.message : err}`);
        }
        const name = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
        if (name === 'index.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(index));
        } else if (files.has(name)) {
          res.setHeader('Content-Type', 'application/zip');
          res.end(files.get(name));
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'presets/index.json', source: JSON.stringify(index) });
      for (const [name, bytes] of files) this.emitFile({ type: 'asset', fileName: `presets/${name}`, source: bytes });
    },
  };
}

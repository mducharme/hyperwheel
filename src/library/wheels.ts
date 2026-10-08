// zip/deflate is only needed for export, import and share links: load it on demand
const zip = () => import('fflate');
import { db } from './db';
import { deleteAsset, getAsset, listAssets, putAsset, MAX_MODEL_SIZE } from './assets';
import { LIMITS, MODEL_MIME } from './limits';
import { array, cleanText, isObject, sanitizeWheel } from './validate';

export interface Entry {
  id: string;
  name: string;
  /** Character id: `builtin:<pack>/<file>` or an uploaded asset id. Unset = random built-in. */
  character?: string;
}

export interface WheelSettings {
  theme: string;
  duration: number;
  removeWinner: boolean;
}

export interface WheelDoc {
  id: string;
  title: string;
  entries: Entry[];
  settings: WheelSettings;
  results: { name: string; at: number }[];
  createdAt: number;
  updatedAt: number;
  /** Small JPEG data URL of the last rendered frame, for the Open list. */
  thumb?: string;
  /** Set on the working copy of a bundled preset wheel (its file name): it can't be deleted. */
  preset?: string;
}

export const DEFAULT_SETTINGS: WheelSettings = {
  theme: 'synthwave',
  duration: 20,
  removeWinner: false,
};

export const uid = () => crypto.randomUUID().slice(0, 8) + Date.now().toString(36);

export function newWheel(title = 'My wheel', names: string[] = []): WheelDoc {
  const now = Date.now();
  return {
    id: uid(),
    title,
    entries: names.map((name) => ({ id: uid(), name })),
    settings: { ...DEFAULT_SETTINGS },
    results: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Fill in fields added in later versions. */
function normalize(w: WheelDoc): WheelDoc {
  return {
    ...newWheel(w.title),
    ...w,
    settings: { ...DEFAULT_SETTINGS, ...w.settings },
    results: w.results ?? [],
  };
}

export const wheels = {
  async list() {
    return (await db.all<WheelDoc>('wheels')).map(normalize).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(id: string) {
    const w = await db.get<WheelDoc>('wheels', id);
    return w ? normalize(w) : undefined;
  },
  async save(w: WheelDoc) {
    w.updatedAt = Date.now();
    await db.put('wheels', w);
  },
  /** Delete a wheel, and any imported models no other wheel uses. */
  async remove(id: string) {
    await db.delete('wheels', id);
    await pruneImportedModels();
  },
  duplicate(w: WheelDoc, title = `${w.title} (copy)`): WheelDoc {
    const copy: WheelDoc = structuredClone(w);
    copy.id = uid();
    copy.title = title;
    copy.results = [];
    delete copy.preset; // a copy of a preset is an ordinary wheel
    copy.createdAt = copy.updatedAt = Date.now();
    copy.entries = copy.entries.map((e) => ({ ...e, id: uid() }));
    return copy;
  },
};

/**
 * Remove models that arrived with an imported wheel or preset once no saved wheel
 * uses them any more. Models the user uploaded themselves are never touched.
 */
export async function pruneImportedModels() {
  const used = new Set((await wheels.list()).flatMap(wheelModels));
  for (const a of await listAssets()) if (a.imported && !used.has(a.id)) await deleteAsset(a.id);
}

/** Ids of the uploaded models a wheel uses. */
export function wheelModels(w: WheelDoc): string[] {
  return [...new Set(w.entries.map((e) => e.character).filter((c): c is string => !!c && !c.startsWith('builtin:')))];
}

// ------------------------------------------------------------------ text ↔ entries

/**
 * Reconcile edited textarea lines with existing entries so characters stay
 * attached to their names (duplicates are matched in order).
 */
export function reconcile(entries: Entry[], names: string[]): Entry[] {
  const pool = new Map<string, Entry[]>();
  for (const e of entries) pool.set(e.name, [...(pool.get(e.name) ?? []), e]);
  return names.map((name) => pool.get(name)?.shift() ?? { id: uid(), name });
}

// ------------------------------------------------------------------ export / import (.locospin = zip)

interface Manifest {
  format: 'locospin';
  version: 1;
  wheel: WheelDoc;
  assets: { id: string; name: string; type: string; path: string }[];
}

/** Bundle a wheel and every file it uses into one downloadable zip. */
export async function exportWheel(w: WheelDoc): Promise<Blob> {
  const { strToU8, zipSync } = await zip();
  const files: Record<string, Uint8Array> = {};
  const manifest: Manifest = { format: 'locospin', version: 1, wheel: { ...w, thumb: undefined, preset: undefined }, assets: [] };
  for (const id of wheelModels(w)) {
    const a = await getAsset(id);
    if (!a) continue;
    const path = `assets/${id}-${a.name.replace(/[^\w.-]+/g, '_')}`;
    files[path] = new Uint8Array(await a.blob.arrayBuffer());
    manifest.assets.push({ id, name: a.name, type: a.type, path });
  }
  files['wheel.json'] = strToU8(JSON.stringify(manifest, null, 2));
  // models are already compressed; storing them avoids wasted CPU
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

export interface ImportReport {
  wheel: WheelDoc;
  /** Bundled files that were missing, too large or not a model. */
  skipped: number;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Import a .locospin file (or an older .hyperwheel one) as a new wheel (its files are added to the library).
 *
 * The file is untrusted (someone sent it), so: sizes are capped before and
 * during unzipping (declared sizes are checked before anything is inflated,
 * and fflate never inflates past a declared size), only expected entries are
 * unpacked, every bundled file is validated on its own, and the wheel itself is
 * rebuilt field by field through `sanitizeWheel` — nothing from the file is
 * stored as-is (including its thumbnail, which could point anywhere).
 */
export async function importWheel(file: Blob): Promise<ImportReport> {
  if (file.size > LIMITS.importFileBytes) {
    throw new Error(`That file is ${mb(file.size)} — the limit is ${mb(LIMITS.importFileBytes)}.`);
  }
  const { strFromU8, unzipSync } = await zip();

  let declared = 0;
  let assetEntries = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => {
        if (f.name === 'wheel.json') return f.originalSize <= LIMITS.manifestBytes;
        if (!f.name.startsWith('assets/') || f.name.includes('..')) return false;
        if (++assetEntries > LIMITS.importAssets) return false;
        if (f.originalSize > MAX_MODEL_SIZE) return false;
        if (declared + f.originalSize > LIMITS.importTotalBytes) return false;
        declared += f.originalSize;
        return true;
      },
    });
  } catch {
    throw new Error('This file is damaged or is not a LocoSpin file.');
  }

  const raw = files['wheel.json'];
  if (!raw) throw new Error('Not a LocoSpin file (wheel.json is missing or too large).');
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(raw));
  } catch {
    throw new Error('This LocoSpin file is damaged (its wheel.json is not valid).');
  }
  // 'hyperwheel' files were exported before the rename
  if (!isObject(manifest) || (manifest.format !== 'locospin' && manifest.format !== 'hyperwheel')) throw new Error('Not a LocoSpin file.');

  // Store bundled files one by one; anything odd is skipped, not fatal.
  // Ids are content hashes, so a file's claimed id is only used to find references to it.
  const remap = new Map<string, string>();
  let skipped = 0;
  for (const a of array(manifest.assets).slice(0, LIMITS.importAssets)) {
    if (!isObject(a)) {
      skipped++;
      continue;
    }
    const bytes = typeof a.path === 'string' ? files[a.path] : undefined;
    if (!bytes) {
      skipped++;
      continue;
    }
    const type = typeof a.type === 'string' && MODEL_MIME.includes(a.type) ? a.type : '';
    const name = cleanText(a.name, LIMITS.nameLength) || 'model.glb';
    try {
      const stored = await putAsset(new Blob([bytes as BlobPart], { type }), name, { imported: true });
      if (typeof a.id === 'string') remap.set(a.id, stored.id);
    } catch {
      skipped++;
    }
  }

  // point references at the stored files, then rebuild the wheel from validated fields only
  const w = isObject(manifest.wheel) ? manifest.wheel : {};
  const mapId = (id: unknown) => (typeof id === 'string' ? (remap.get(id) ?? id) : id);
  const mapped = {
    ...w,
    entries: array(w.entries).map((e) => (isObject(e) ? { ...e, character: mapId(e.character) } : e)),
  };
  const clean = sanitizeWheel(mapped, new Set(remap.values()));

  const wheel = newWheel(clean.title, []);
  wheel.entries = clean.entries.map((e) => ({ id: uid(), ...e }));
  wheel.settings = { ...DEFAULT_SETTINGS, ...clean.settings };
  wheel.results = clean.results;
  await wheels.save(wheel);
  return { wheel, skipped };
}

// ------------------------------------------------------------------ share links

interface Shared {
  t: string;
  n: string[];
  /** built-in character per entry ('' = random) — uploads can't travel in a URL */
  c?: string[];
  s: Partial<WheelSettings>;
}

const b64url = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** A link carrying names, built-in characters and settings. Uploaded files can't fit in a URL. */
export async function shareLink(w: WheelDoc): Promise<{ url: string; dropped: number }> {
  const { strToU8, deflateSync } = await zip();
  const builtins = w.entries.map((e) => (e.character?.startsWith('builtin:') ? e.character.slice(8) : ''));
  const payload: Shared = { t: w.title, n: w.entries.map((e) => e.name), s: w.settings };
  if (builtins.some(Boolean)) payload.c = builtins;
  const data = b64url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }));
  const url = `${location.origin}${location.pathname}#w=${data}`;
  return { url, dropped: wheelModels(w).length };
}

/** Inflate at most `max` bytes, stopping as soon as the output passes it. */
async function inflateCapped(data: Uint8Array, max: number): Promise<Uint8Array> {
  const { Inflate } = await zip();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const inflater = new Inflate((chunk) => {
    size += chunk.length;
    if (size > max) throw new Error('share link expands past the size limit');
    chunks.push(chunk);
  });
  // small input slices bound how much a single push can expand (deflate tops out near 1000:1)
  for (let i = 0; i < data.length; i += 512) inflater.push(data.subarray(i, i + 512), i + 512 >= data.length);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export type ShareLinkResult = { wheel: WheelDoc } | { error: string };

/**
 * If the page was opened from a share link, turn it into a new wheel.
 *
 * Links come from anyone, so the payload is bounded (encoded length and inflated
 * size) and rebuilt through `sanitizeWheel` like an imported file: only text,
 * known setting values and built-in character ids survive.
 */
export async function readShareLink(): Promise<ShareLinkResult | null> {
  const m = location.hash.match(/^#w=([\w-]*)/);
  if (!m) return null;
  const bad = { error: "That share link is damaged or incomplete, so it couldn't be opened." };
  if (!m[1] || m[1].length > LIMITS.shareLinkChars) return bad;
  try {
    const { strFromU8 } = await zip();
    const p: unknown = JSON.parse(strFromU8(await inflateCapped(fromB64url(m[1]), LIMITS.shareJsonBytes)));
    if (!isObject(p)) return bad;
    const c = array(p.c);
    const clean = sanitizeWheel(
      {
        title: p.t,
        entries: array(p.n).map((name, i) => ({ name, character: typeof c[i] === 'string' && c[i] ? `builtin:${c[i]}` : undefined })),
        settings: p.s,
      },
      new Set(), // uploads never travel in a link
    );
    const w = newWheel(clean.title === 'Imported wheel' ? 'Shared wheel' : clean.title, []);
    w.entries = clean.entries.map((e) => ({ id: uid(), ...e }));
    w.settings = { ...DEFAULT_SETTINGS, ...clean.settings };
    return { wheel: w };
  } catch (err) {
    console.warn('bad share link', err);
    return bad;
  }
}

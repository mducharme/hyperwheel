import { strFromU8, strToU8, unzipSync, zipSync, deflateSync, inflateSync } from 'fflate';
import { db } from './db';
import { getAsset, putAsset, type AssetKind } from './assets';

export interface Entry {
  id: string;
  name: string;
  /** Character id: `builtin:<pack>/<file>` or an uploaded asset id. Unset = random built-in. */
  character?: string;
}

export interface WheelSettings {
  theme: string;
  duration: number;
  autoSwitch: boolean;
  switchMode: 'next' | 'random';
  removeWinner: boolean;
}

export interface WheelAudio {
  /** Uploaded spin tracks (asset ids). */
  spin: string[];
  /** Uploaded win sound (asset id). */
  win: string | null;
  /** Prefer these over the scene's own music. */
  enabled: boolean;
}

export interface WheelDoc {
  id: string;
  title: string;
  entries: Entry[];
  settings: WheelSettings;
  audio: WheelAudio;
  results: { name: string; at: number }[];
  createdAt: number;
  updatedAt: number;
  /** Small JPEG data URL of the last rendered frame, for the Open list. */
  thumb?: string;
}

export const DEFAULT_SETTINGS: WheelSettings = {
  theme: 'synthwave',
  duration: 8,
  autoSwitch: true,
  switchMode: 'random',
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
    audio: { spin: [], win: null, enabled: true },
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
    audio: Object.assign({ spin: [], win: null, enabled: true }, w.audio),
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
  async remove(id: string) {
    await db.delete('wheels', id);
  },
  duplicate(w: WheelDoc, title = `${w.title} (copy)`): WheelDoc {
    const copy: WheelDoc = structuredClone(w);
    copy.id = uid();
    copy.title = title;
    copy.results = [];
    copy.createdAt = copy.updatedAt = Date.now();
    copy.entries = copy.entries.map((e) => ({ ...e, id: uid() }));
    return copy;
  },
};

/** Asset ids a wheel depends on (uploaded characters and audio). */
export function wheelAssets(w: WheelDoc): { id: string; kind: AssetKind }[] {
  const ids = new Map<string, AssetKind>();
  for (const e of w.entries) if (e.character && !e.character.startsWith('builtin:')) ids.set(e.character, 'model');
  for (const id of w.audio.spin) ids.set(id, 'audio');
  if (w.audio.win) ids.set(w.audio.win, 'audio');
  return [...ids].map(([id, kind]) => ({ id, kind }));
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

// ------------------------------------------------------------------ export / import (.hyperwheel = zip)

interface Manifest {
  format: 'hyperwheel';
  version: 1;
  wheel: WheelDoc;
  assets: { id: string; kind: AssetKind; name: string; type: string; path: string }[];
}

/** Bundle a wheel and every file it uses into one downloadable zip. */
export async function exportWheel(w: WheelDoc): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const manifest: Manifest = { format: 'hyperwheel', version: 1, wheel: { ...w, thumb: undefined }, assets: [] };
  for (const { id } of wheelAssets(w)) {
    const a = await getAsset(id);
    if (!a) continue;
    const path = `assets/${id}-${a.name.replace(/[^\w.-]+/g, '_')}`;
    files[path] = new Uint8Array(await a.blob.arrayBuffer());
    manifest.assets.push({ id, kind: a.kind, name: a.name, type: a.type, path });
  }
  files['wheel.json'] = strToU8(JSON.stringify(manifest, null, 2));
  // models and audio are already compressed; storing them avoids wasted CPU
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as BlobPart], { type: 'application/zip' });
}

/** Import a .hyperwheel file as a new wheel (its files are added to the library). */
export async function importWheel(file: Blob): Promise<WheelDoc> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const raw = files['wheel.json'];
  if (!raw) throw new Error('Not a HyperWheel file (wheel.json is missing).');
  const manifest = JSON.parse(strFromU8(raw)) as Manifest;
  if (manifest.format !== 'hyperwheel') throw new Error('Not a HyperWheel file.');

  // asset ids are content hashes, so re-importing maps onto the same ids
  const remap = new Map<string, string>();
  for (const a of manifest.assets) {
    const bytes = files[a.path];
    if (!bytes) continue;
    const stored = await putAsset(new Blob([bytes as BlobPart], { type: a.type }), a.kind, a.name);
    remap.set(a.id, stored.id);
  }
  const w = normalize(manifest.wheel);
  const wheel = wheels.duplicate(w, w.title);
  wheel.entries = wheel.entries.map((e) => ({ ...e, character: e.character ? (remap.get(e.character) ?? e.character) : undefined }));
  wheel.audio.spin = wheel.audio.spin.map((id) => remap.get(id) ?? id);
  if (wheel.audio.win) wheel.audio.win = remap.get(wheel.audio.win) ?? wheel.audio.win;
  await wheels.save(wheel);
  return wheel;
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
export function shareLink(w: WheelDoc): { url: string; dropped: number } {
  const builtins = w.entries.map((e) => (e.character?.startsWith('builtin:') ? e.character.slice(8) : ''));
  const payload: Shared = { t: w.title, n: w.entries.map((e) => e.name), s: w.settings };
  if (builtins.some(Boolean)) payload.c = builtins;
  const data = b64url(deflateSync(strToU8(JSON.stringify(payload)), { level: 9 }));
  const url = `${location.origin}${location.pathname}#w=${data}`;
  return { url, dropped: wheelAssets(w).length };
}

/** If the page was opened from a share link, turn it into a new wheel. */
export function readShareLink(): WheelDoc | null {
  const m = location.hash.match(/^#w=([\w-]+)/);
  if (!m) return null;
  try {
    const p = JSON.parse(strFromU8(inflateSync(fromB64url(m[1])))) as Shared;
    const w = newWheel(p.t || 'Shared wheel', p.n ?? []);
    w.entries.forEach((e, i) => {
      if (p.c?.[i]) e.character = `builtin:${p.c[i]}`;
    });
    w.settings = { ...DEFAULT_SETTINGS, ...p.s };
    return w;
  } catch (err) {
    console.warn('bad share link', err);
    return null;
  }
}

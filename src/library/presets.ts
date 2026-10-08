/**
 * Preset wheels bundled with the site (see scripts/presetWheels.ts). They can't
 * be deleted. Opening one (from the list or by URL) always starts fresh: the
 * file is imported again as a working copy tagged with `preset`, replacing the
 * previous copy — all its names back, no results.
 */
import { importWheel, wheels, type WheelDoc } from './wheels';
import { array, cleanText, isObject } from './validate';
import { LIMITS } from './limits';

export interface Preset {
  file: string;
  title: string;
  names: number;
  /** Its names, from the index: enough to show the wheel while the file downloads. */
  entries: string[];
}

// letters, digits, - and _ only: the name (without .locospin) is also the preset's URL path
const FILE = /^[\w-]+\.locospin$/;
const url = (path: string) => `${import.meta.env.BASE_URL}presets/${path}`;

let cache: Promise<Preset[]> | null = null;

/** The bundled presets (empty when the site was built without any). */
export function listPresets(): Promise<Preset[]> {
  return (cache ??= fetch(url('index.json'))
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) =>
      (Array.isArray(list) ? list : []).flatMap((p) =>
        isObject(p) && typeof p.file === 'string' && FILE.test(p.file)
          ? [
              {
                file: p.file,
                title: cleanText(p.title, LIMITS.titleLength) || p.file,
                names: typeof p.names === 'number' ? p.names : 0,
                entries: array(p.entries).map((n) => cleanText(n, LIMITS.nameLength)).filter(Boolean).slice(0, LIMITS.entries),
              },
            ]
          : [],
      ),
    )
    .catch(() => []));
}

/** Download a preset file, reporting progress (0..1) when the size is known. */
async function download(p: Preset, onProgress?: (done: number) => void): Promise<Blob> {
  const res = await fetch(url(encodeURIComponent(p.file)));
  if (!res.ok || !res.body) throw new Error(`Couldn't load “${p.title}”.`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!onProgress || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new Blob(chunks);
}

/** A fresh working copy of a preset (replacing any earlier one). */
export async function openPreset(p: Preset, onProgress?: (done: number) => void): Promise<WheelDoc> {
  // presets go through the same untrusted-file import as anything else
  const { wheel } = await importWheel(await download(p, onProgress));
  // only once the new copy exists, so a failed download leaves the old one in place
  for (const old of await wheels.list()) if (old.preset === p.file && old.id !== wheel.id) await wheels.remove(old.id);
  wheel.preset = p.file;
  await wheels.save(wheel);
  return wheel;
}

/**
 * Preset wheels bundled with the site (see scripts/presetWheels.ts). They can't
 * be deleted. Opening one (from the list or by URL) always starts fresh: the
 * file is imported again as a working copy tagged with `preset`, replacing the
 * previous copy — all its names back, no results.
 */
import { importWheel, wheels, type WheelDoc } from './wheels';
import { cleanText, isObject } from './validate';

export interface Preset {
  file: string;
  title: string;
  names: number;
}

// letters, digits, - and _ only: the name (without .hyperwheel) is also the preset's URL path
const FILE = /^[\w-]+\.hyperwheel$/;
const url = (path: string) => `${import.meta.env.BASE_URL}presets/${path}`;

let cache: Promise<Preset[]> | null = null;

/** The bundled presets (empty when the site was built without any). */
export function listPresets(): Promise<Preset[]> {
  return (cache ??= fetch(url('index.json'))
    .then((r) => (r.ok ? r.json() : []))
    .then((list: unknown) =>
      (Array.isArray(list) ? list : []).flatMap((p) =>
        isObject(p) && typeof p.file === 'string' && FILE.test(p.file)
          ? [{ file: p.file, title: cleanText(p.title, 60) || p.file, names: typeof p.names === 'number' ? p.names : 0 }]
          : [],
      ),
    )
    .catch(() => []));
}

/** A fresh working copy of a preset (replacing any earlier one). */
export async function openPreset(p: Preset): Promise<WheelDoc> {
  const res = await fetch(url(encodeURIComponent(p.file)));
  if (!res.ok) throw new Error(`Couldn't load “${p.title}”.`);
  // presets go through the same untrusted-file import as anything else
  const { wheel } = await importWheel(await res.blob());
  // only once the new copy exists, so a failed download leaves the old one in place
  for (const old of await wheels.list()) if (old.preset === p.file && old.id !== wheel.id) await wheels.remove(old.id);
  wheel.preset = p.file;
  await wheels.save(wheel);
  return wheel;
}

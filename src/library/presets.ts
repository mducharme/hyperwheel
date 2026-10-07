/**
 * Preset wheels bundled with the site (see scripts/presetWheels.ts). They can't
 * be deleted: opening one imports a working copy the first time, tagged with
 * `preset`, and reopens that copy after — so edits never touch the original.
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

/** The working copy of a preset, imported on first use. */
export async function openPreset(p: Preset): Promise<WheelDoc> {
  const existing = (await wheels.list()).find((w) => w.preset === p.file);
  if (existing) return existing;
  const res = await fetch(url(encodeURIComponent(p.file)));
  if (!res.ok) throw new Error(`Couldn't load “${p.title}”.`);
  // presets go through the same untrusted-file import as anything else
  const { wheel } = await importWheel(await res.blob());
  wheel.preset = p.file;
  await wheels.save(wheel);
  return wheel;
}

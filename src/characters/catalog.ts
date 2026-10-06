/**
 * Built-in character packs, shipped in public/characters/<pack>/ (all CC0).
 * Ids look like `builtin:<pack>/<name>` so wheels can reference them without
 * storing any bytes. Packs can be toggled in Settings; names without an
 * assigned character get a random one from the enabled packs.
 */
export interface CharacterInfo {
  id: string;
  name: string;
  pack: string;
  /** Main model (skeleton + body). */
  url: string;
  /** Extra skinned meshes bound to the main skeleton (e.g. hairstyles). */
  parts?: string[];
  /** Extra files whose animation clips are added to this character. */
  animations?: string[];
  /** Clip names to celebrate with (otherwise matched by name). */
  celebrations?: string[];
  preview?: string;
}

export interface CharacterPack {
  id: string;
  name: string;
  description: string;
  credit: string;
  link: string;
  /** Enabled for new users. */
  defaultEnabled: boolean;
  characters: CharacterInfo[];
}

const base = `${import.meta.env.BASE_URL}characters`;

// ------------------------------------------------------------------ KayKit adventurers

const KAYKIT: [name: string, file: string][] = [
  ['Knight', 'knight'],
  ['Barbarian', 'barbarian'],
  ['Mage', 'mage'],
  ['Ranger', 'ranger'],
  ['Rogue', 'rogue'],
  ['Hooded Rogue', 'rogue_hooded'],
];

const kaykit: CharacterPack = {
  id: 'kaykit',
  name: 'Adventurers',
  description: 'Chunky chibi fantasy heroes with their gear',
  credit: 'Kay Lousberg — KayKit Adventurers (CC0)',
  link: 'https://kaylousberg.itch.io/kaykit-adventurers',
  defaultEnabled: true,
  characters: KAYKIT.map(([name, file]) => ({
    id: `builtin:kaykit/${file}`,
    name,
    pack: 'kaykit',
    url: `${base}/kaykit/${file}.glb`,
    animations: [`${base}/kaykit/anim-movement.glb`, `${base}/kaykit/anim-general.glb`],
    celebrations: ['Jump_Full_Short', 'Jump_Full_Long'],
  })),
};

// ------------------------------------------------------------------ Kenney blocky

const KENNEY_NAMES = [
  'Pixel Pete', 'Blocky Bea', 'Cubert', 'Squarah', 'Boxley', 'Brick Rick',
  'Tetra Tess', 'Chunk', 'Voxelle', 'Brickworth', 'Cornelius', 'Dot',
  'Mona Block', 'Sir Cubes', 'Polly Gone', 'Stacks', 'Tile Kyle', 'Quadrina',
];

const kenney: CharacterPack = {
  id: 'kenney',
  name: 'Blocky',
  description: 'Boxy voxel-style characters',
  credit: 'Kenney — Blocky Characters (CC0)',
  link: 'https://kenney.nl/assets/blocky-characters',
  defaultEnabled: true,
  characters: KENNEY_NAMES.map((name, i) => {
    const file = `character-${String.fromCharCode(97 + i)}`;
    return {
      id: `builtin:kenney/${file}`,
      name,
      pack: 'kenney',
      url: `${base}/kenney/${file}.glb`,
      celebrations: ['emote-yes'],
    };
  }),
};

export const PACKS: CharacterPack[] = [kaykit, kenney];
export const BUILTINS: CharacterInfo[] = PACKS.flatMap((p) => p.characters);
export const builtin = (id: string) => BUILTINS.find((b) => b.id === id);
export const DEFAULT_PACKS = PACKS.filter((p) => p.defaultEnabled).map((p) => p.id);

let enabled = new Set(DEFAULT_PACKS);
/** Which packs feed automatic characters and the picker. */
export function setEnabledPacks(ids: string[]) {
  enabled = new Set(ids.filter((id) => PACKS.some((p) => p.id === id)));
}
export const enabledPacks = () => PACKS.filter((p) => enabled.has(p.id));

/** A stored character id that still exists (built-ins can be retired; uploads are checked when loaded). */
export const isKnownCharacter = (id: string) => !id.startsWith('builtin:') || !!builtin(id);

/** Stable "random" built-in for a name without a character, so a name keeps its look. */
export function defaultCharacterFor(name: string): string {
  const pool = enabledPacks().flatMap((p) => p.characters);
  const list = pool.length ? pool : BUILTINS;
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length].id;
}

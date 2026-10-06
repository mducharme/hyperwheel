/**
 * Built-in characters, shipped in public/characters/. All CC0.
 * Ids look like `builtin:<pack>/<file>` so wheels can reference them without
 * storing any bytes.
 */
export interface CharacterInfo {
  id: string;
  name: string;
  url: string;
  preview?: string;
  credit?: string;
}

const KENNEY_NAMES = [
  'Pixel Pete', 'Blocky Bea', 'Cubert', 'Squarah', 'Boxley', 'Brick Rick',
  'Tetra Tess', 'Chunk', 'Voxelle', 'Brickworth', 'Cornelius', 'Dot',
  'Mona Block', 'Sir Cubes', 'Polly Gone', 'Stacks', 'Tile Kyle', 'Quadrina',
];

const base = import.meta.env.BASE_URL;

export const BUILTINS: CharacterInfo[] = KENNEY_NAMES.map((name, i) => {
  const file = `character-${String.fromCharCode(97 + i)}`;
  return {
    id: `builtin:kenney/${file}`,
    name,
    url: `${base}characters/kenney/${file}.glb`,
    preview: `${base}characters/kenney/previews/${file}.png`,
    credit: 'Kenney — Blocky Characters (CC0)',
  };
});

export const builtin = (id: string) => BUILTINS.find((b) => b.id === id);

/** Stable "random" built-in for names without a character, so a name keeps its look. */
export function defaultCharacterFor(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return BUILTINS[(h >>> 0) % BUILTINS.length].id;
}

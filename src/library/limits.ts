/** Hard limits for anything a user (or a file someone sent them) can put into a wheel. */
export const LIMITS = {
  entries: 500,
  nameLength: 120,
  titleLength: 60,
  results: 200,
  duration: { min: 3, max: 20 },

  /** .locospin import */
  importFileBytes: 300 * 1024 * 1024,
  manifestBytes: 2 * 1024 * 1024,
  importTotalBytes: 400 * 1024 * 1024,
  importAssets: 200,

  /** share links (#w=…): encoded length, and the JSON it may inflate to */
  shareLinkChars: 128 * 1024,
  shareJsonBytes: 256 * 1024,
} as const;

/** File types accepted for bundled models in an imported wheel. */
export const MODEL_MIME: readonly string[] = ['model/gltf-binary', 'application/octet-stream', 'model/fbx', ''];

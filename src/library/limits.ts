/** Hard limits for anything a user (or a file someone sent them) can put into a wheel. */
export const LIMITS = {
  entries: 500,
  nameLength: 120,
  titleLength: 60,
  results: 200,
  /** Uploaded spin songs / win sounds per wheel. */
  audioPerKind: 40,
  duration: { min: 3, max: 20 },

  /** .hyperwheel import */
  importFileBytes: 300 * 1024 * 1024,
  manifestBytes: 2 * 1024 * 1024,
  importTotalBytes: 400 * 1024 * 1024,
  importAssets: 200,
} as const;

export const MIME_ALLOWED = {
  model: ['model/gltf-binary', 'application/octet-stream', 'model/fbx', ''],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac', ''],
} as const;

import { db } from './db';

export interface Asset {
  /** SHA-256 of the bytes: identical uploads are stored once. */
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
  /**
   * Arrived inside an imported wheel file or preset rather than being uploaded
   * by hand: it's removed again once no wheel uses it (see pruneImportedModels).
   */
  imported?: boolean;
}

/** Largest uploaded model accepted. */
export const MAX_MODEL_SIZE = 40 * 1024 * 1024;

async function hash(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a model (deduplicated by content) and return it. `imported`: it came inside a wheel file, not from the user's own upload. */
export async function putAsset(file: Blob, name: string, { imported = false } = {}): Promise<Asset> {
  if (file.size > MAX_MODEL_SIZE) {
    throw new Error(`${name} is ${(file.size / 1e6).toFixed(1)} MB — the limit is ${MAX_MODEL_SIZE / 1e6} MB.`);
  }
  const id = await hash(await file.arrayBuffer());
  const existing = await db.get<Asset>('assets', id);
  if (existing) {
    // uploading it by hand makes it the user's own: never cleaned up automatically
    if (existing.imported && !imported) {
      delete existing.imported;
      await db.put('assets', existing);
    }
    return existing;
  }
  const asset: Asset = { id, name, type: file.type, size: file.size, blob: file, createdAt: Date.now(), ...(imported && { imported: true }) };
  await db.put('assets', asset);
  return asset;
}

const urlCache = new Map<string, string>();

export const getAsset = (id: string) => db.get<Asset>('assets', id);

/** Object URL for an asset (cached for the session). */
export async function assetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const a = await getAsset(id);
  if (!a) return null;
  const url = URL.createObjectURL(a.blob);
  urlCache.set(id, url);
  return url;
}

export async function listAssets() {
  return (await db.all<Asset>('assets')).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAsset(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await db.delete('assets', id);
  await db.delete('thumbs', id);
}

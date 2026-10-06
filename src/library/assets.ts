import { db } from './db';

export type AssetKind = 'model' | 'audio';

export interface Asset {
  /** SHA-256 of the bytes: identical uploads are stored once. */
  id: string;
  kind: AssetKind;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export const MAX_SIZE: Record<AssetKind, number> = {
  model: 40 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

async function hash(buf: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a file (deduplicated by content) and return its id. */
export async function putAsset(file: Blob, kind: AssetKind, name: string): Promise<Asset> {
  if (file.size > MAX_SIZE[kind]) {
    throw new Error(`${name} is ${(file.size / 1e6).toFixed(1)} MB — the limit is ${MAX_SIZE[kind] / 1e6} MB.`);
  }
  const id = await hash(await file.arrayBuffer());
  const existing = await db.get<Asset>('assets', id);
  if (existing) return existing;
  const asset: Asset = { id, kind, name, type: file.type, size: file.size, blob: file, createdAt: Date.now() };
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

export async function listAssets(kind: AssetKind) {
  return (await db.all<Asset>('assets')).filter((a) => a.kind === kind).sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteAsset(id: string) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
  await db.delete('assets', id);
  await db.delete('thumbs', id);
}

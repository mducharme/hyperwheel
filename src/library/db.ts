/**
 * Tiny promise wrapper around IndexedDB. Wheels, uploaded models and cached
 * thumbnails all live here — localStorage is far too small for binary assets.
 *
 * When IndexedDB can't be used (blocked, some private modes, or it never
 * answers) everything is kept in memory instead: the app still works, it just
 * forgets on reload. `storageAvailable()` tells the UI so it can say so.
 */
const DB_NAME = 'locospin';
const VERSION = 1;
/** Give up on IndexedDB if opening it takes longer than this. */
const OPEN_TIMEOUT = 8000;
export type StoreName = 'wheels' | 'assets' | 'thumbs';

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<StoreName, Map<IDBValidKey, unknown>>();
const memStore = (store: StoreName) => memory.get(store) ?? memory.set(store, new Map()).get(store)!;

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    const fail = (why: unknown) => {
      console.warn('IndexedDB unavailable, keeping data in memory only:', why);
      resolve(null);
    };
    const timer = setTimeout(() => fail('timed out'), OPEN_TIMEOUT);
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('wheels')) db.createObjectStore('wheels', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        fail(req.error);
      };
    } catch (err) {
      clearTimeout(timer);
      fail(err);
    }
  });
  return dbPromise;
}

/** Whether data is really being saved (false = memory only, lost on reload). */
export const storageAvailable = () => open().then((d) => d !== null);

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, fallback: (m: Map<IDBValidKey, unknown>) => T): Promise<T> {
  return open().then((db) => {
    if (!db) return fallback(memStore(store));
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });
}

// memory mode stores copies, like IndexedDB does, so later edits to an object don't leak in
const keyOf = (store: StoreName, value: unknown, key?: IDBValidKey) => key ?? (store === 'thumbs' ? undefined : (value as { id: IDBValidKey }).id);

export const db = {
  get: <T>(store: StoreName, key: IDBValidKey) =>
    run<T | undefined>(store, 'readonly', (s) => s.get(key), (m) => (m.has(key) ? structuredClone(m.get(key) as T) : undefined)),
  all: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll(), (m) => [...m.values()].map((v) => structuredClone(v as T))),
  put: <T>(store: StoreName, value: T, key?: IDBValidKey) =>
    run<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key), (m) => {
      const k = keyOf(store, value, key)!;
      m.set(k, structuredClone(value));
      return k;
    }),
  delete: (store: StoreName, key: IDBValidKey) => run<undefined>(store, 'readwrite', (s) => s.delete(key), (m) => void m.delete(key)),
};

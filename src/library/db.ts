/**
 * Tiny promise wrapper around IndexedDB. Wheels, uploaded files (models,
 * audio) and cached thumbnails all live here — localStorage is far too small
 * for binary assets.
 */
const DB_NAME = 'hyperwheel';
const VERSION = 1;
export type StoreName = 'wheels' | 'assets' | 'thumbs';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('wheels')) db.createObjectStore('wheels', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const db = {
  get: <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, 'readonly', (s) => s.get(key)),
  all: <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll()),
  put: <T>(store: StoreName, value: T, key?: IDBValidKey) => run(store, 'readwrite', (s) => s.put(value, key)),
  delete: (store: StoreName, key: IDBValidKey) => run(store, 'readwrite', (s) => s.delete(key)),
};

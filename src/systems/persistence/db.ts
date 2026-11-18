/**
 * Storage layer. IndexedDB holds the save record and binary media (photos,
 * videos). If IndexedDB is missing or blocked, an in-memory store with the same
 * interface is used and `persistent` is false so the UI can warn the player.
 */
import { DB_NAME } from '../../config';

export type StoreName = 'saves' | 'photos' | 'videos';
const STORES: StoreName[] = ['saves', 'photos', 'videos'];

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: 'quota' | 'unavailable' | 'failed',
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface GameStorage {
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  clear(store: StoreName): Promise<void>;
}

function toStorageError(e: unknown): StorageError {
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = (e as { message?: string } | null)?.message ?? String(e);
  if (name === 'QuotaExceededError' || /quota/i.test(message)) return new StorageError(message, 'quota');
  return new StorageError(message, 'failed');
}

export class MemoryStorage implements GameStorage {
  readonly persistent = false;
  private data = new Map<StoreName, Map<string, unknown>>();
  private bucket(store: StoreName): Map<string, unknown> {
    let b = this.data.get(store);
    if (!b) {
      b = new Map();
      this.data.set(store, b);
    }
    return b;
  }
  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.bucket(store).get(key) as T | undefined;
  }
  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    this.bucket(store).set(key, value);
  }
  async delete(store: StoreName, key: string): Promise<void> {
    this.bucket(store).delete(key);
  }
  async keys(store: StoreName): Promise<string[]> {
    return [...this.bucket(store).keys()];
  }
  async clear(store: StoreName): Promise<void> {
    this.bucket(store).clear();
  }
}

export class IndexedDbStorage implements GameStorage {
  readonly persistent = true;
  constructor(private readonly db: IDBDatabase) {}

  private run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let request: IDBRequest<T>;
      try {
        const tx = this.db.transaction(store, mode);
        request = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(toStorageError(tx.error ?? request.error));
        tx.onerror = () => reject(toStorageError(tx.error ?? request.error));
      } catch (e) {
        reject(toStorageError(e));
      }
    });
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  }
  async put(store: StoreName, key: string, value: unknown): Promise<void> {
    await this.run(store, 'readwrite', (s) => s.put(value, key));
  }
  async delete(store: StoreName, key: string): Promise<void> {
    await this.run(store, 'readwrite', (s) => s.delete(key));
  }
  async keys(store: StoreName): Promise<string[]> {
    const keys = await this.run(store, 'readonly', (s) => s.getAllKeys());
    return keys.map(String);
  }
  async clear(store: StoreName): Promise<void> {
    await this.run(store, 'readwrite', (s) => s.clear());
  }
}

export function openIndexedDb(factory: IDBFactory, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(name, 1);
    } catch (e) {
      reject(new StorageError(String(e), 'unavailable'));
      return;
    }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError(req.error?.message ?? 'open failed', 'unavailable'));
    req.onblocked = () => reject(new StorageError('database is blocked by another tab', 'unavailable'));
  });
}

let storagePromise: Promise<GameStorage> | null = null;

/** Opens (once) the best available storage backend. Never rejects. */
export function getStorage(): Promise<GameStorage> {
  if (!storagePromise) {
    storagePromise = (async (): Promise<GameStorage> => {
      try {
        if (typeof indexedDB === 'undefined') return new MemoryStorage();
        return new IndexedDbStorage(await openIndexedDb(indexedDB));
      } catch {
        return new MemoryStorage();
      }
    })();
  }
  return storagePromise;
}

/** Test hook. */
export function setStorageForTests(storage: GameStorage | null): void {
  storagePromise = storage ? Promise.resolve(storage) : null;
}

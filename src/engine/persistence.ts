import { createEmptyProject, ProjectModel } from './model';
import { deserializeProject, serializeProject } from './serialization';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProjectPersistence {
  save(project: ProjectModel): void | Promise<void>;
  load(): ProjectModel | null | Promise<ProjectModel | null>;
  clear(): void | Promise<void>;
}

export function getDefaultStorage(): StorageLike | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  try {
    return (globalThis as typeof globalThis & { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

export function saveProjectToStorage(
  project: ProjectModel,
  key = 'character-studio-project',
  storage: StorageLike | undefined = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, serializeProject(project));
    return true;
  } catch {
    return false;
  }
}

export function loadProjectFromStorage(
  key = 'character-studio-project',
  storage: StorageLike | undefined = getDefaultStorage(),
): ProjectModel | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(key);
    return value ? deserializeProject(value) : null;
  } catch {
    return null;
  }
}

export function clearProjectFromStorage(
  key = 'character-studio-project',
  storage: StorageLike | undefined = getDefaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function createLocalStoragePersistence(
  key = 'character-studio-project',
  storage: StorageLike | undefined = getDefaultStorage(),
): ProjectPersistence {
  return {
    save: (project) => { saveProjectToStorage(project, key, storage); },
    load: () => loadProjectFromStorage(key, storage),
    clear: () => { clearProjectFromStorage(key, storage); },
  };
}

/** Small async interface shared by IndexedDB wrappers and test adapters. */
export interface AsyncKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createAsyncProjectPersistence(store: AsyncKeyValueStore, key = 'character-studio-project'): ProjectPersistence {
  return {
    save: (project) => store.set(key, serializeProject(project)),
    load: async () => {
      const value = await store.get(key);
      return value ? deserializeProject(value) : null;
    },
    clear: () => store.delete(key),
  };
}

/**
 * Creates an IndexedDB-backed persistence adapter without requiring the idb package.
 * The adapter is intentionally small so it can also be replaced by an app's own DB.
 */
export function createIndexedDbPersistence(
  databaseName = 'character-studio',
  storeName = 'projects',
  key = 'current',
): ProjectPersistence | null {
  if (typeof indexedDB === 'undefined') return null;
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open project database'));
  });
  const run = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Project database operation failed'));
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => reject(transaction.error ?? new Error('Project database transaction failed'));
    });
  };
  return createAsyncProjectPersistence({
    get: async (itemKey) => (await run<string | undefined>('readonly', (store) => store.get(itemKey))) ?? null,
    set: async (itemKey, value) => { await run<IDBValidKey>('readwrite', (store) => store.put(value, itemKey)); },
    delete: async (itemKey) => { await run<undefined>('readwrite', (store) => store.delete(itemKey)); },
  }, key);
}

/** Returns a normalized blank project when a persisted project is not available. */
export function loadOrCreateProject(
  key = 'character-studio-project',
  storage: StorageLike | undefined = getDefaultStorage(),
): ProjectModel {
  return loadProjectFromStorage(key, storage) ?? createEmptyProject();
}

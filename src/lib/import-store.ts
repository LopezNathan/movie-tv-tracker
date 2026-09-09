import type { NormalizedImportItem } from '../../shared/types';

export type PendingImport = {
  runId: string;
  filename: string;
  items: NormalizedImportItem[];
  nextIndex: number;
};

const databaseName = 'scene-imports';
const storeName = 'pending';
const activeKey = 'active';

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const request = operation(db.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

export const importStore = {
  get: () => transaction<PendingImport | undefined>('readonly', (store) => store.get(activeKey)),
  save: (value: PendingImport) =>
    transaction<IDBValidKey>('readwrite', (store) => store.put(value, activeKey)).then(
      () => undefined,
    ),
  clear: () =>
    transaction<undefined>('readwrite', (store) => store.delete(activeKey)).then(() => undefined),
};

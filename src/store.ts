// Progress kept in the visitor's own browser (IndexedDB — a plan photo is too big for
// localStorage). Nothing is sent anywhere. Every call fails quietly: private windows and
// blocked storage simply mean the builder starts fresh next time.

const DB = 'vastu-map'
const STORE = 'kv'
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbp.catch(() => (dbp = null))
  }
  return dbp
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return db()
    .then(
      (d) =>
        new Promise<T | undefined>((resolve) => {
          const req = fn(d.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result as T)
          req.onerror = () => resolve(undefined)
        }),
    )
    .catch(() => undefined)
}

export const kvGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key))
export const kvSet = (key: string, value: unknown) => run('readwrite', (s) => s.put(value, key))
export const kvClear = () => run('readwrite', (s) => s.clear())

export type InterventionDraft = {
  base: Record<string, any>;
  values: Record<string, any>;
  files: File[];
  images: any[];
  deleted: number[];
};

// Shared across mounts: reopening a tab waits for the previous form's pending writes.
const writes = new Map<string, Promise<void>>();

// IndexedDB preserves File bytes as well as text. Keys are project/user/ticket scoped.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fom-intervention-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readInterventionDraft(key: string): Promise<InterventionDraft | undefined> {
  await writes.get(key)?.catch(() => {});
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function persist(key: string, draft?: InterventionDraft) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts");
      if (draft) store.put(draft, key); else store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function writeInterventionDraft(key: string, draft?: InterventionDraft) {
  const pending = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => persist(key, draft));
  writes.set(key, pending);
  const clear = () => { if (writes.get(key) === pending) writes.delete(key); };
  void pending.then(clear, clear);
  return pending;
}

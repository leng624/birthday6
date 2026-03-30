const DB_NAME = "timecap_db_v1";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode, storeName, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = fn(store);
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

export function putPhotoBlob(id, blob) {
  return withStore("readwrite", "photos", (store) => {
    store.put({ id, blob, updatedAt: new Date().toISOString() });
  });
}

export function getPhotoBlob(id) {
  return withStore("readonly", "photos", (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export function deletePhotoBlob(id) {
  return withStore("readwrite", "photos", (store) => {
    store.delete(id);
  });
}

export function clearAll() {
  return withStore("readwrite", "photos", (store) => {
    store.clear();
  });
}


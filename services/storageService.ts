
// Simple IndexedDB wrapper for caching audio
const DB_NAME = 'LingoFlowCache';
const STORE_NAME = 'audio_cache';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
        console.error("IndexedDB error:", request.error);
        reject(request.error);
    };
    
    request.onsuccess = () => {
        dbInstance = request.result;
        resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); 
      }
    };
  });
};

export const cacheAudio = async (key: string, buffer: ArrayBuffer) => {
  try {
      const db = await initDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        // We clone the buffer because ArrayBuffers can be detached when stored
        const req = store.put(buffer.slice(0), key);
        
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
  } catch (e) {
      console.warn("Failed to cache audio", e);
  }
};

export const getCachedAudio = async (key: string): Promise<ArrayBuffer | null> => {
  try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => {
            // Don't reject, just return null to fall back to network
            console.warn("Cache miss/error", req.error);
            resolve(null);
        };
      });
  } catch (e) {
      return null;
  }
};

// Helper to generate a simple hash for text keys
export const hashText = (text: string): string => {
  let hash = 0;
  if (text.length === 0) return hash.toString();
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'audio_' + hash;
};

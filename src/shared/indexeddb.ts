/**
 * IndexedDB wrapper for large data storage
 * Provides ~50% disk quota vs localStorage's 5-10MB
 */

const DB_NAME = 'spotify-music-league';
const DB_VERSION = 1;

// Object stores
const STORES = {
  LIBRARY: 'library',
  PLAYLISTS: 'playlists',
  PLAYLIST_TRACKS: 'playlist_tracks',
  ARTIST_FOLLOWERS: 'artist_followers',
} as const;

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB connection
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Library store
      if (!db.objectStoreNames.contains(STORES.LIBRARY)) {
        db.createObjectStore(STORES.LIBRARY);
      }

      // Playlists store
      if (!db.objectStoreNames.contains(STORES.PLAYLISTS)) {
        db.createObjectStore(STORES.PLAYLISTS);
      }

      // Playlist tracks store (keyed by playlist ID)
      if (!db.objectStoreNames.contains(STORES.PLAYLIST_TRACKS)) {
        db.createObjectStore(STORES.PLAYLIST_TRACKS);
      }

      // Artist followers cache (keyed by artist ID)
      if (!db.objectStoreNames.contains(STORES.ARTIST_FOLLOWERS)) {
        const store = db.createObjectStore(STORES.ARTIST_FOLLOWERS);
        store.createIndex('expires_at', 'expires_at', { unique: false });
      }
    };
  });
}

/**
 * Get data from IndexedDB
 */
export async function idbGet<T>(store: keyof typeof STORES, key: string): Promise<T | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES[store], 'readonly');
      const objectStore = transaction.objectStore(STORES[store]);
      const request = objectStore.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`IndexedDB get error for ${store}:${key}`, err);
    return null;
  }
}

/**
 * Set data in IndexedDB
 */
export async function idbSet<T>(store: keyof typeof STORES, key: string, value: T): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES[store], 'readwrite');
      const objectStore = transaction.objectStore(STORES[store]);
      const request = objectStore.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`IndexedDB set error for ${store}:${key}`, err);
    throw err;
  }
}

/**
 * Delete data from IndexedDB
 */
export async function idbDelete(store: keyof typeof STORES, key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES[store], 'readwrite');
      const objectStore = transaction.objectStore(STORES[store]);
      const request = objectStore.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`IndexedDB delete error for ${store}:${key}`, err);
  }
}

/**
 * Get all keys from a store
 */
export async function idbGetAllKeys(store: keyof typeof STORES): Promise<string[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES[store], 'readonly');
      const objectStore = transaction.objectStore(STORES[store]);
      const request = objectStore.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`IndexedDB getAllKeys error for ${store}`, err);
    return [];
  }
}

/**
 * Clear all data from a store
 */
export async function idbClear(store: keyof typeof STORES): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES[store], 'readwrite');
      const objectStore = transaction.objectStore(STORES[store]);
      const request = objectStore.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`IndexedDB clear error for ${store}`, err);
  }
}

/**
 * Clean up expired artist follower cache entries
 */
export async function idbCleanupExpiredArtists(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ARTIST_FOLLOWERS, 'readwrite');
      const objectStore = transaction.objectStore(STORES.ARTIST_FOLLOWERS);
      const index = objectStore.index('expires_at');

      const now = Date.now();
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to cleanup expired artists', err);
    return 0;
  }
}

/**
 * Migrate data from localStorage to IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<void> {
  console.log('Migrating data from localStorage to IndexedDB...');

  try {
    // Migrate library
    const cachedLibrary = localStorage.getItem('cached_library');
    if (cachedLibrary) {
      await idbSet('LIBRARY', 'main', JSON.parse(cachedLibrary));
      localStorage.removeItem('cached_library');
      console.log('✓ Migrated library');
    }

    // Migrate playlists
    const cachedPlaylists = localStorage.getItem('cached_playlists');
    if (cachedPlaylists) {
      await idbSet('PLAYLISTS', 'main', JSON.parse(cachedPlaylists));
      localStorage.removeItem('cached_playlists');
      console.log('✓ Migrated playlists');
    }

    // Migrate individual playlist caches
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cached_playlist_')) {
        const playlistId = key.replace('cached_playlist_', '');
        const data = localStorage.getItem(key);
        if (data) {
          await idbSet('PLAYLIST_TRACKS', playlistId, JSON.parse(data));
          localStorage.removeItem(key);
          console.log(`✓ Migrated playlist ${playlistId}`);
        }
      }
    }

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

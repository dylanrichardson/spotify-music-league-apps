// Caching utility functions for localStorage management

export function getCachedItem<T>(key: string): T | null {
  const cached = localStorage.getItem(key);
  if (!cached) return null;

  try {
    return JSON.parse(cached) as T;
  } catch (err) {
    console.error(`Failed to parse cached item: ${key}`, err);
    localStorage.removeItem(key);
    return null;
  }
}

export function setCachedItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Failed to cache item: ${key} (quota exceeded)`, err);
  }
}

export function removeCachedItem(key: string): void {
  localStorage.removeItem(key);
}

export function clearAllCache(): void {
  localStorage.removeItem('cached_library');
  localStorage.removeItem('cached_playlists');
  localStorage.removeItem('user_profile');

  // Clear all cached playlists
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('cached_playlist_')) {
      localStorage.removeItem(key);
    }
  });
}

export function clearAuthData(): void {
  localStorage.removeItem('spotify_tokens');
  localStorage.removeItem('code_verifier');
  localStorage.removeItem('auth_return_path');
}

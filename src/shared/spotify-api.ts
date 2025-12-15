import type { SpotifyTrack, SpotifyPlaylist, UserProfile, CachedLibrary, CachedTrack, CachedPlaylist, CachedPlaylists } from '../rounds/types';
import { getStoredTokens, refreshAccessToken } from './spotify-auth';
import { idbGet, idbSet, idbDelete, idbCleanupExpiredArtists, migrateFromLocalStorage } from './indexeddb';

// Cache version - increment this when making breaking changes to cache structure
const CACHE_VERSION = 3; // Bumped for IndexedDB migration

// Artist follower cache TTL: 7 days
const ARTIST_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

// Convert SpotifyTrack to minimal CachedTrack
function toMinimalTrack(track: SpotifyTrack): CachedTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map(a => a.name).join(', '),
    artistIds: track.artists.map(a => a.id || '').join(', '),
    albumName: track.album.name,
    releaseDate: track.album.release_date,
    imageUrl: track.album.images[0]?.url || '',
    uri: track.uri,
    durationMs: track.duration_ms,
  };
}

// Convert CachedTrack back to SpotifyTrack
function fromMinimalTrack(cached: CachedTrack): SpotifyTrack {
  const artistNames = cached.artists.split(', ');
  const artistIds = cached.artistIds ? cached.artistIds.split(', ') : [];

  return {
    id: cached.id,
    name: cached.name,
    artists: artistNames.map((name, index) => ({
      name,
      id: artistIds[index] || undefined,
    })),
    album: {
      name: cached.albumName,
      release_date: cached.releaseDate,
      images: cached.imageUrl ? [{ url: cached.imageUrl }] : [],
    },
    uri: cached.uri,
    duration_ms: cached.durationMs,
  };
}

const API_BASE = 'https://api.spotify.com/v1';

// Get access token, refreshing if needed
async function getAccessToken(): Promise<string> {
  let tokens = getStoredTokens();

  if (!tokens) {
    // Clear any stale data and redirect to login
    localStorage.removeItem('spotify_tokens');
    localStorage.removeItem('code_verifier');
    localStorage.removeItem('cached_library');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('cached_playlists');
    window.location.href = '/spotify-music-league-apps/';
    throw new Error('No authentication tokens found');
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  if (Date.now() >= tokens.expires_at - 5 * 60 * 1000) {
    try {
      tokens = await refreshAccessToken(tokens.refresh_token);
    } catch (err) {
      // Refresh failed, clear tokens and redirect to login
      localStorage.removeItem('spotify_tokens');
      localStorage.removeItem('code_verifier');
      localStorage.removeItem('cached_library');
      localStorage.removeItem('user_profile');
      localStorage.removeItem('cached_playlists');
      window.location.href = '/spotify-music-league-apps/';
      throw err;
    }
  }

  return tokens.access_token;
}

/**
 * Retry logic with exponential backoff for Spotify API
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Check if it's a retryable error
      const status = err?.status || 0;
      const isRetryable = status === 429 || status >= 500;

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      // Calculate backoff delay
      const delay = initialDelay * Math.pow(2, attempt);
      const jitter = Math.random() * 200; // Add jitter
      const totalDelay = delay + jitter;

      console.log(`Retrying after ${Math.round(totalDelay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  throw lastError;
}

// Make authenticated API request with retry logic
async function fetchFromSpotify<T>(endpoint: string): Promise<T> {
  return retryWithBackoff(async () => {
    const accessToken = await getAccessToken();

    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error: any = new Error(`Spotify API error: ${response.statusText}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  });
}

/**
 * Initialize storage - migrate from localStorage to IndexedDB if needed
 */
let migrationChecked = false;
async function ensureMigration() {
  if (migrationChecked) return;
  migrationChecked = true;

  // Check if migration needed
  const hasOldCache = localStorage.getItem('cached_library') || localStorage.getItem('cached_playlists');
  if (hasOldCache) {
    try {
      await migrateFromLocalStorage();
      console.log('✓ Migration complete!');
    } catch (err) {
      console.error('Migration failed:', err);
    }
  }

  // Clean up expired artist cache periodically
  await cleanupArtistCache();
}

// Fetch user profile (keep in localStorage - small data)
export async function fetchUserProfile(): Promise<UserProfile> {
  const cached = localStorage.getItem('user_profile');
  if (cached) {
    return JSON.parse(cached);
  }

  const profile = await fetchFromSpotify<UserProfile>('/me');
  localStorage.setItem('user_profile', JSON.stringify(profile));
  return profile;
}

// Fetch all saved tracks from library (using IndexedDB)
export async function fetchLibraryTracks(
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void,
  forceRefresh: boolean = false,
  showToastOnError?: (message: string, type: 'error' | 'warning') => void
): Promise<SpotifyTrack[]> {
  await ensureMigration();

  // Return cached data if available and not forcing refresh
  if (!forceRefresh) {
    try {
      const cachedData = await idbGet<CachedLibrary>('LIBRARY', 'main');

      if (cachedData) {
        // Check cache version - invalidate if old
        if (cachedData.version !== CACHE_VERSION) {
          console.log('Cache version mismatch, invalidating old cache');
          await idbDelete('LIBRARY', 'main');
        } else {
          const tracks = cachedData.tracks.map(fromMinimalTrack);
          // Call progress callback with all cached tracks at once
          if (onProgress) {
            onProgress(tracks.length, tracks.length, tracks);
          }
          return tracks;
        }
      }
    } catch (err) {
      console.error('Failed to load cached library, will refetch:', err);
    }
  }

  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const response = await fetchFromSpotify<{
      items: { track: SpotifyTrack }[];
      total: number;
    }>(`/me/tracks?limit=${limit}&offset=${offset}`);

    const newTracks = response.items.map((item) => item.track);
    tracks.push(...newTracks);

    if (onProgress) {
      onProgress(tracks.length, response.total, newTracks);
    }

    if (tracks.length >= response.total) {
      break;
    }

    offset += limit;
  }

  // Cache the results with minimal data in IndexedDB
  try {
    const cacheData: CachedLibrary = {
      version: CACHE_VERSION,
      tracks: tracks.map(toMinimalTrack),
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    await idbSet('LIBRARY', 'main', cacheData);
  } catch (err) {
    console.warn('Failed to cache library:', err);
    if (showToastOnError) {
      showToastOnError('Unable to cache library. You may need to clear browser data.', 'warning');
    }
  }

  return tracks;
}

// Get last sync time for library
export async function getLibraryLastSync(): Promise<number | null> {
  try {
    const cachedData = await idbGet<CachedLibrary>('LIBRARY', 'main');
    if (cachedData && cachedData.version === CACHE_VERSION) {
      return cachedData.lastSynced || cachedData.timestamp;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Resync library with smart merge
export async function resyncLibrary(
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<{ added: SpotifyTrack[]; removed: string[]; tracks: SpotifyTrack[] }> {
  const existingTrackIds = new Set<string>();

  try {
    const cachedData = await idbGet<CachedLibrary>('LIBRARY', 'main');
    if (cachedData) {
      cachedData.tracks.forEach(t => existingTrackIds.add(t.id));
    }
  } catch (err) {
    console.error('Failed to load cached library:', err);
  }

  // Fetch fresh data
  const freshTracks = await fetchLibraryTracks(onProgress, true);
  const freshTrackIds = new Set(freshTracks.map(t => t.id));

  // Calculate diff
  const added = freshTracks.filter(t => !existingTrackIds.has(t.id));
  const removed = Array.from(existingTrackIds).filter(id => !freshTrackIds.has(id));

  return { added, removed, tracks: freshTracks };
}

// Fetch user's playlists
export async function fetchUserPlaylists(forceRefresh: boolean = false): Promise<SpotifyPlaylist[]> {
  await ensureMigration();

  // Check cache first - auto-sync every 24 hours
  if (!forceRefresh) {
    try {
      const cachedData = await idbGet<CachedPlaylists>('PLAYLISTS', 'main');

      if (cachedData) {
        // Check cache version - invalidate if old
        if (cachedData.version !== CACHE_VERSION) {
          console.log('Playlists cache version mismatch, invalidating old cache');
          await idbDelete('PLAYLISTS', 'main');
        } else {
          const lastSynced = cachedData.lastSynced || cachedData.timestamp;

          // Auto-sync if older than 24 hours
          if (Date.now() - lastSynced < 24 * 60 * 60 * 1000) {
            return cachedData.playlists;
          }

          // If older than 24 hours, fall through to refresh
          console.log('Playlists cache older than 24 hours, auto-syncing...');
        }
      }
    } catch (err) {
      console.error('Failed to load cached playlists, will refetch:', err);
    }
  }

  const playlists: SpotifyPlaylist[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const response = await fetchFromSpotify<{
      items: SpotifyPlaylist[];
      total: number;
    }>(`/me/playlists?limit=${limit}&offset=${offset}`);

    playlists.push(...response.items);

    if (playlists.length >= response.total) {
      break;
    }

    offset += limit;
  }

  // Cache the playlists
  try {
    const cacheData: CachedPlaylists = {
      version: CACHE_VERSION,
      playlists,
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    await idbSet('PLAYLISTS', 'main', cacheData);
  } catch (err) {
    console.warn('Failed to cache playlists:', err);
  }

  return playlists;
}

// Get last sync time for playlists
export async function getPlaylistsLastSync(): Promise<number | null> {
  try {
    const cachedData = await idbGet<CachedPlaylists>('PLAYLISTS', 'main');
    if (cachedData && cachedData.version === CACHE_VERSION) {
      return cachedData.lastSynced || cachedData.timestamp;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Resync playlists
export async function resyncPlaylists(): Promise<SpotifyPlaylist[]> {
  return await fetchUserPlaylists(true);
}

// Fetch tracks from a specific playlist
export async function fetchPlaylistTracks(
  playlistId: string,
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void,
  forceRefresh: boolean = false
): Promise<SpotifyTrack[]> {
  await ensureMigration();

  // Check cache
  if (!forceRefresh) {
    try {
      const cachedData = await idbGet<CachedPlaylist>('PLAYLIST_TRACKS', playlistId);

      if (cachedData) {
        // Check cache version - invalidate if old
        if (cachedData.version !== CACHE_VERSION) {
          console.log(`Playlist cache version mismatch for ${playlistId}, invalidating old cache`);
          await idbDelete('PLAYLIST_TRACKS', playlistId);
        } else {
          const tracks = cachedData.tracks.map(fromMinimalTrack);
          if (onProgress) {
            onProgress(tracks.length, tracks.length, tracks);
          }
          return tracks;
        }
      }
    } catch (err) {
      console.error('Failed to load cached playlist, will refetch:', err);
    }
  }

  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await fetchFromSpotify<{
      items: { track: SpotifyTrack | null }[];
      total: number;
    }>(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);

    // Filter out null tracks (podcasts, deleted tracks, etc.)
    const validTracks = response.items
      .filter((item) => item.track !== null)
      .map((item) => item.track!);

    tracks.push(...validTracks);

    if (onProgress) {
      onProgress(tracks.length, response.total, validTracks);
    }

    if (tracks.length >= response.total) {
      break;
    }

    offset += limit;
  }

  // Cache the playlist
  try {
    const cacheData: CachedPlaylist = {
      version: CACHE_VERSION,
      playlistId,
      tracks: tracks.map(toMinimalTrack),
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    await idbSet('PLAYLIST_TRACKS', playlistId, cacheData);
  } catch (err) {
    console.warn('Failed to cache playlist:', err);
  }

  return tracks;
}

// Get last sync time for a playlist
export async function getPlaylistLastSync(playlistId: string): Promise<number | null> {
  try {
    const cachedData = await idbGet<CachedPlaylist>('PLAYLIST_TRACKS', playlistId);
    if (cachedData && cachedData.version === CACHE_VERSION) {
      return cachedData.lastSynced || cachedData.timestamp;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Resync playlist with smart merge
export async function resyncPlaylistTracks(
  playlistId: string,
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<{ added: SpotifyTrack[]; removed: string[]; tracks: SpotifyTrack[] }> {
  const existingTrackIds = new Set<string>();

  try {
    const cachedData = await idbGet<CachedPlaylist>('PLAYLIST_TRACKS', playlistId);
    if (cachedData) {
      cachedData.tracks.forEach(t => existingTrackIds.add(t.id));
    }
  } catch (err) {
    console.error('Failed to load cached playlist:', err);
  }

  // Fetch fresh data
  const freshTracks = await fetchPlaylistTracks(playlistId, onProgress, true);
  const freshTrackIds = new Set(freshTracks.map(t => t.id));

  // Calculate diff
  const added = freshTracks.filter(t => !existingTrackIds.has(t.id));
  const removed = Array.from(existingTrackIds).filter(id => !freshTrackIds.has(id));

  return { added, removed, tracks: freshTracks };
}

/**
 * Get artist follower count (with caching)
 */
export async function getArtistFollowers(artistId: string): Promise<number> {
  // Check cache first
  const cacheKey = `artist_${artistId}`;
  const cached = await idbGet<{ followers: number; expires_at: number }>('ARTIST_FOLLOWERS', cacheKey);

  if (cached && cached.expires_at > Date.now()) {
    return cached.followers;
  }

  // Fetch from API
  const artist = await fetchFromSpotify<{ id: string; name: string; followers: { total: number } }>(`/artists/${artistId}`);
  const followers = artist.followers.total;

  // Cache the result
  try {
    await idbSet('ARTIST_FOLLOWERS', cacheKey, {
      followers,
      expires_at: Date.now() + ARTIST_CACHE_TTL,
    });
  } catch (err) {
    console.warn('Failed to cache artist data:', err);
  }

  return followers;
}

/**
 * Batch fetch artist followers with parallelization (10 concurrent)
 * Returns Map of artistId -> follower count
 */
export async function batchFetchArtistFollowers(
  artistIds: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const batchSize = 10;
  let completed = 0;

  // Process in batches
  for (let i = 0; i < artistIds.length; i += batchSize) {
    const batch = artistIds.slice(i, i + batchSize);

    // Fetch batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (artistId) => {
        try {
          const followers = await getArtistFollowers(artistId);
          return { artistId, followers };
        } catch (err) {
          console.error(`Failed to fetch artist ${artistId}:`, err);
          return { artistId, followers: -1 }; // Use -1 to indicate error
        }
      })
    );

    // Add results to map
    batchResults.forEach(({ artistId, followers }) => {
      if (followers >= 0) {
        results.set(artistId, followers);
      }
    });

    completed += batch.length;
    if (onProgress) {
      onProgress(completed, artistIds.length);
    }
  }

  return results;
}

// Fetch artist details (for monthly listeners) - legacy function, prefer getArtistFollowers
export async function fetchArtist(artistId: string): Promise<{ id: string; name: string; followers: { total: number } }> {
  return await fetchFromSpotify(`/artists/${artistId}`);
}

/**
 * Clean up expired artist follower cache (call periodically)
 */
export async function cleanupArtistCache(): Promise<void> {
  const deleted = await idbCleanupExpiredArtists();
  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} expired artist cache entries`);
  }
}

// Play a track on the user's active device
export async function playTrack(trackUri: string): Promise<void> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${API_BASE}/me/player/play`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uris: [trackUri],
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No active device found. Please open Spotify on one of your devices.');
    }
    throw new Error('Failed to start playback');
  }
}

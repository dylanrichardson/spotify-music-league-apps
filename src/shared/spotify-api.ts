import type { SpotifyTrack, SpotifyPlaylist, UserProfile, CachedLibrary, CachedTrack, CachedPlaylist, CachedPlaylists } from '../rounds/types';
import { getStoredTokens, refreshAccessToken } from './spotify-auth';

// Convert SpotifyTrack to minimal CachedTrack
function toMinimalTrack(track: SpotifyTrack): CachedTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map(a => a.name).join(', '),
    albumName: track.album.name,
    releaseDate: track.album.release_date,
    imageUrl: track.album.images[0]?.url || '',
    uri: track.uri,
    durationMs: track.duration_ms,
  };
}

// Convert CachedTrack back to SpotifyTrack
function fromMinimalTrack(cached: CachedTrack): SpotifyTrack {
  return {
    id: cached.id,
    name: cached.name,
    artists: cached.artists.split(', ').map(name => ({ name })),
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

// Make authenticated API request
async function fetchFromSpotify<T>(endpoint: string): Promise<T> {
  const accessToken = await getAccessToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify API error: ${response.statusText}`);
  }

  return response.json();
}

// Fetch user profile
export async function fetchUserProfile(): Promise<UserProfile> {
  const cached = localStorage.getItem('user_profile');
  if (cached) {
    return JSON.parse(cached);
  }

  const profile = await fetchFromSpotify<UserProfile>('/me');
  localStorage.setItem('user_profile', JSON.stringify(profile));
  return profile;
}

// Fetch all saved tracks from library
export async function fetchLibraryTracks(
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void,
  forceRefresh: boolean = false
): Promise<SpotifyTrack[]> {
  // Return cached data if available and not forcing refresh
  if (!forceRefresh) {
    const cached = localStorage.getItem('cached_library');
    if (cached) {
      try {
        const cachedData: CachedLibrary = JSON.parse(cached);
        const tracks = cachedData.tracks.map(fromMinimalTrack);
        // Call progress callback with all cached tracks at once
        if (onProgress) {
          onProgress(tracks.length, tracks.length, tracks);
        }
        return tracks;
      } catch (err) {
        console.error('Failed to parse cached library, will refetch:', err);
        localStorage.removeItem('cached_library');
      }
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

  // Cache the results with minimal data
  try {
    const cacheData: CachedLibrary = {
      tracks: tracks.map(toMinimalTrack),
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    localStorage.setItem('cached_library', JSON.stringify(cacheData));
  } catch (err) {
    console.warn('Failed to cache library (quota exceeded):', err);
    // Continue without caching
  }

  return tracks;
}

// Get last sync time for library
export function getLibraryLastSync(): number | null {
  const cached = localStorage.getItem('cached_library');
  if (cached) {
    try {
      const cachedData: CachedLibrary = JSON.parse(cached);
      return cachedData.lastSynced || cachedData.timestamp;
    } catch (err) {
      return null;
    }
  }
  return null;
}

// Resync library with smart merge
export async function resyncLibrary(
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<{ added: SpotifyTrack[]; removed: string[]; tracks: SpotifyTrack[] }> {
  const cached = localStorage.getItem('cached_library');
  const existingTrackIds = new Set<string>();

  if (cached) {
    try {
      const cachedData: CachedLibrary = JSON.parse(cached);
      cachedData.tracks.forEach(t => existingTrackIds.add(t.id));
    } catch (err) {
      console.error('Failed to parse cached library:', err);
    }
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
  // Check cache first - auto-sync every 24 hours
  const cached = localStorage.getItem('cached_playlists');
  if (!forceRefresh && cached) {
    try {
      const cachedData: CachedPlaylists = JSON.parse(cached);
      const lastSynced = cachedData.lastSynced || cachedData.timestamp;

      // Auto-sync if older than 24 hours
      if (Date.now() - lastSynced < 24 * 60 * 60 * 1000) {
        return cachedData.playlists;
      }

      // If older than 24 hours, fall through to refresh
      console.log('Playlists cache older than 24 hours, auto-syncing...');
    } catch (err) {
      console.error('Failed to parse cached playlists, will refetch:', err);
      localStorage.removeItem('cached_playlists');
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
      playlists,
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    localStorage.setItem('cached_playlists', JSON.stringify(cacheData));
  } catch (err) {
    console.warn('Failed to cache playlists (quota exceeded):', err);
  }

  return playlists;
}

// Get last sync time for playlists
export function getPlaylistsLastSync(): number | null {
  const cached = localStorage.getItem('cached_playlists');
  if (cached) {
    try {
      const cachedData: CachedPlaylists = JSON.parse(cached);
      return cachedData.lastSynced || cachedData.timestamp;
    } catch (err) {
      return null;
    }
  }
  return null;
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
  // Check cache
  const cacheKey = `cached_playlist_${playlistId}`;

  if (!forceRefresh) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const cachedData: CachedPlaylist = JSON.parse(cached);
        const tracks = cachedData.tracks.map(fromMinimalTrack);
        if (onProgress) {
          onProgress(tracks.length, tracks.length, tracks);
        }
        return tracks;
      } catch (err) {
        console.error('Failed to parse cached playlist, will refetch:', err);
        localStorage.removeItem(cacheKey);
      }
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
      playlistId,
      tracks: tracks.map(toMinimalTrack),
      timestamp: Date.now(),
      lastSynced: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (err) {
    console.warn('Failed to cache playlist (quota exceeded):', err);
    // Continue without caching
  }

  return tracks;
}

// Get last sync time for a playlist
export function getPlaylistLastSync(playlistId: string): number | null {
  const cacheKey = `cached_playlist_${playlistId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const cachedData: CachedPlaylist = JSON.parse(cached);
      return cachedData.lastSynced || cachedData.timestamp;
    } catch (err) {
      return null;
    }
  }
  return null;
}

// Resync playlist with smart merge
export async function resyncPlaylistTracks(
  playlistId: string,
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<{ added: SpotifyTrack[]; removed: string[]; tracks: SpotifyTrack[] }> {
  const cacheKey = `cached_playlist_${playlistId}`;
  const cached = localStorage.getItem(cacheKey);
  const existingTrackIds = new Set<string>();

  if (cached) {
    try {
      const cachedData: CachedPlaylist = JSON.parse(cached);
      cachedData.tracks.forEach(t => existingTrackIds.add(t.id));
    } catch (err) {
      console.error('Failed to parse cached playlist:', err);
    }
  }

  // Fetch fresh data
  const freshTracks = await fetchPlaylistTracks(playlistId, onProgress, true);
  const freshTrackIds = new Set(freshTracks.map(t => t.id));

  // Calculate diff
  const added = freshTracks.filter(t => !existingTrackIds.has(t.id));
  const removed = Array.from(existingTrackIds).filter(id => !freshTrackIds.has(id));

  return { added, removed, tracks: freshTracks };
}

// Fetch artist details (for monthly listeners)
export async function fetchArtist(artistId: string): Promise<{ id: string; name: string; followers: { total: number } }> {
  return await fetchFromSpotify(`/artists/${artistId}`);
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

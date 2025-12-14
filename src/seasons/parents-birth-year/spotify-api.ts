import type { SpotifyTrack, SpotifyPlaylist, UserProfile, CachedLibrary, CachedTrack, CachedPlaylist } from './types';
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
  };
}

const API_BASE = 'https://api.spotify.com/v1';

// Get access token, refreshing if needed
async function getAccessToken(): Promise<string> {
  let tokens = getStoredTokens();

  if (!tokens) {
    throw new Error('No authentication tokens found');
  }

  // Check if token needs refresh (within 5 minutes of expiry)
  if (Date.now() >= tokens.expires_at - 5 * 60 * 1000) {
    tokens = await refreshAccessToken(tokens.refresh_token);
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
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<SpotifyTrack[]> {
  const cached = localStorage.getItem('cached_library');
  if (cached) {
    try {
      const cachedData: CachedLibrary = JSON.parse(cached);
      // Cache valid for 24 hours
      if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
        const tracks = cachedData.tracks.map(fromMinimalTrack);
        // Call progress callback with all cached tracks at once
        if (onProgress) {
          onProgress(tracks.length, tracks.length, tracks);
        }
        return tracks;
      }
    } catch (err) {
      console.error('Failed to parse cached library, will refetch:', err);
      localStorage.removeItem('cached_library');
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
    };
    localStorage.setItem('cached_library', JSON.stringify(cacheData));
  } catch (err) {
    console.warn('Failed to cache library (quota exceeded):', err);
    // Continue without caching
  }

  return tracks;
}

// Fetch user's playlists
export async function fetchUserPlaylists(): Promise<SpotifyPlaylist[]> {
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

  return playlists;
}

// Fetch tracks from a specific playlist
export async function fetchPlaylistTracks(
  playlistId: string,
  onProgress?: (current: number, total: number, newTracks: SpotifyTrack[]) => void
): Promise<SpotifyTrack[]> {
  // Check cache
  const cacheKey = `cached_playlist_${playlistId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const cachedData: CachedPlaylist = JSON.parse(cached);
      // Cache valid for 1 hour (playlists change more frequently than library)
      if (Date.now() - cachedData.timestamp < 60 * 60 * 1000) {
        const tracks = cachedData.tracks.map(fromMinimalTrack);
        if (onProgress) {
          onProgress(tracks.length, tracks.length, tracks);
        }
        return tracks;
      }
    } catch (err) {
      console.error('Failed to parse cached playlist, will refetch:', err);
      localStorage.removeItem(cacheKey);
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
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (err) {
    console.warn('Failed to cache playlist (quota exceeded):', err);
    // Continue without caching
  }

  return tracks;
}

// Filter tracks by release year
export function filterTracksByYears(
  tracks: SpotifyTrack[],
  startYear: number,
  endYear: number
): SpotifyTrack[] {
  return tracks.filter((track) => {
    const releaseDate = track.album.release_date;
    const year = parseInt(releaseDate.split('-')[0]);
    return year >= startYear && year <= endYear;
  });
}

// Get exact birth year as a single year range
export function getYearRange(birthYear: number): { start: number; end: number } {
  return {
    start: birthYear,
    end: birthYear,
  };
}

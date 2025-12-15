export interface RoundConfig {
  number: number;
  title: string;
  subtitle: string | null;
  path: string;
  enabled: boolean;
  description?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string; id?: string }[];
  album: {
    name: string;
    release_date: string;
    images: { url: string }[];
  };
  uri: string;
  duration_ms?: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  tracks: {
    total: number;
  };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  followers?: {
    total: number;
  };
}

export interface CachedTrack {
  id: string;
  name: string;
  artists: string;
  albumName: string;
  releaseDate: string;
  imageUrl: string;
  uri: string;
  durationMs?: number;
}

export interface CachedLibrary {
  tracks: CachedTrack[];
  timestamp: number;
  lastSynced: number;
}

export interface CachedPlaylist {
  playlistId: string;
  tracks: CachedTrack[];
  timestamp: number;
  lastSynced: number;
}

export interface CachedPlaylists {
  playlists: SpotifyPlaylist[];
  timestamp: number;
  lastSynced: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface UserProfile {
  display_name: string;
  id: string;
  images: { url: string }[];
}

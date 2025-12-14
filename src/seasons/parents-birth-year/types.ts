export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    release_date: string;
    images: { url: string }[];
  };
  uri: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  tracks: {
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
}

export interface CachedLibrary {
  tracks: CachedTrack[];
  timestamp: number;
}

export interface CachedPlaylist {
  playlistId: string;
  tracks: CachedTrack[];
  timestamp: number;
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

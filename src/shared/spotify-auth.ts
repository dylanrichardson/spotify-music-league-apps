import type { AuthTokens } from '../rounds/types';

const CLIENT_ID = '337781715d4842f98d85fe828cb0d56f';
const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
];

// Get unified redirect URI for OAuth callback
function getRedirectURI(): string {
  const basePath = '/spotify-music-league-apps';
  const callbackPath = '/callback';
  const fullPath = `${basePath}${callbackPath}`;

  const isLocalhost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  return isLocalhost
    ? `http://127.0.0.1:8080${fullPath}`
    : `${window.location.origin}${fullPath}`;
}

// Generate code verifier for PKCE
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

// Generate code challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}

// Base64 URL encoding
function base64URLEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Start the OAuth flow
export async function redirectToSpotifyAuth(roundPath: string): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store verifier and return path for later use
  localStorage.setItem('code_verifier', codeVerifier);
  localStorage.setItem('auth_return_path', roundPath);

  const redirectURI = getRedirectURI();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectURI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForToken(code: string, _callbackPath: string): Promise<AuthTokens> {
  const codeVerifier = localStorage.getItem('code_verifier');

  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }

  const redirectURI = getRedirectURI();

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectURI,
    code_verifier: codeVerifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  const data = await response.json();

  const tokens: AuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Store tokens (shared across all rounds)
  localStorage.setItem('spotify_tokens', JSON.stringify(tokens));
  localStorage.removeItem('code_verifier');
  // Note: auth_return_path is removed by AuthCallback after navigation

  return tokens;
}

// Get stored tokens
export function getStoredTokens(): AuthTokens | null {
  const stored = localStorage.getItem('spotify_tokens');
  if (!stored) return null;

  const tokens: AuthTokens = JSON.parse(stored);

  // Check if token is expired
  if (Date.now() >= tokens.expires_at) {
    return null;
  }

  return tokens;
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await response.json();

  const tokens: AuthTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  localStorage.setItem('spotify_tokens', JSON.stringify(tokens));

  return tokens;
}

// Logout
export function logout(): void {
  localStorage.removeItem('spotify_tokens');
  localStorage.removeItem('code_verifier');
  localStorage.removeItem('auth_return_path');
  // Don't clear cache - it should persist across sessions
  window.location.href = '/spotify-music-league-apps/';
}

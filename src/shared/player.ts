import { getStoredTokens } from './spotify-auth';

// Extend Window interface for Spotify SDK
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }
}

interface PlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: {
    current_track: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: {
        name: string;
        images: Array<{ url: string }>;
      };
      uri: string;
    };
  };
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  volume_percent: number;
}

export type PlaybackMode = 'sdk' | 'connect' | null;

class SpotifyPlayerManager {
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private mode: PlaybackMode = null;
  private onStateChangeCallback: ((state: PlayerState | null) => void) | null = null;
  private sdkReadyPromise: Promise<void> | null = null;
  private pollingInterval: number | null = null;

  constructor() {
    // Set up the SDK ready callback
    this.sdkReadyPromise = new Promise((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('Spotify Web Playback SDK ready');
        resolve();
      };
    });
  }

  async initialize(onStateChange: (state: PlayerState | null) => void): Promise<PlaybackMode> {
    this.onStateChangeCallback = onStateChange;

    // Try to initialize Web Playback SDK first
    try {
      const mode = await this.initializeSDK();
      this.mode = mode;
      return mode;
    } catch (err) {
      console.log('Web Playback SDK not available, using Connect API fallback:', err);
      this.mode = 'connect';
      return 'connect';
    }
  }

  private async initializeSDK(): Promise<PlaybackMode> {
    // Wait for SDK to be ready (with timeout)
    const sdkTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SDK load timeout')), 5000)
    );

    try {
      await Promise.race([this.sdkReadyPromise, sdkTimeout]);
    } catch (err) {
      throw new Error('Spotify SDK failed to load');
    }

    return new Promise((resolve, reject) => {
      // Check if SDK is loaded
      if (!window.Spotify) {
        reject(new Error('Spotify SDK not loaded'));
        return;
      }

      const tokens = getStoredTokens();
      if (!tokens) {
        reject(new Error('No access token'));
        return;
      }

      this.player = new window.Spotify.Player({
        name: 'Music League Helper',
        getOAuthToken: (cb) => {
          const tokens = getStoredTokens();
          cb(tokens?.access_token || '');
        },
        volume: 0.5,
      });

      // Error handling
      this.player.addListener('initialization_error', ({ message }) => {
        console.error('SDK initialization error:', message);
        reject(new Error(message));
      });

      this.player.addListener('authentication_error', ({ message }) => {
        console.error('SDK authentication error:', message);
        reject(new Error(message));
      });

      this.player.addListener('account_error', ({ message }) => {
        console.error('SDK account error (may not be Premium):', message);
        reject(new Error(message));
      });

      this.player.addListener('playback_error', ({ message }) => {
        console.error('SDK playback error:', message);
      });

      // Ready
      this.player.addListener('ready', async ({ device_id }) => {
        console.log('Spotify Web Playback SDK ready with Device ID:', device_id);

        // Immediately activate this device so it's ready for playback
        try {
          await this.activateDevice(device_id);
          // Fetch the actual device ID from Spotify's API
          this.deviceId = await this.getActiveDeviceId();
          console.log('Device activated successfully, actual device ID:', this.deviceId);
        } catch (err) {
          console.warn('Failed to activate device immediately:', err);
          // Fall back to the SDK-provided device ID
          this.deviceId = device_id;
        }

        resolve('sdk');
      });

      // Player state updates
      this.player.addListener('player_state_changed', (state) => {
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback(state);
        }
      });

      // Connect to the player
      this.player.connect().catch((err) => {
        reject(err);
      });
    });
  }

  async playTrack(trackUri: string): Promise<void> {
    const tokens = getStoredTokens();
    if (!tokens) {
      throw new Error('No authentication tokens');
    }

    if (this.mode === 'sdk' && this.deviceId) {
      // Use Web Playback SDK - transfer playback to our device first
      const response = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + this.deviceId, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: [trackUri],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Playback error:', error);

        // If device not found, try to transfer playback first
        if (response.status === 404) {
          await this.transferPlayback();
          // Retry playback
          const retryResponse = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + this.deviceId, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uris: [trackUri],
            }),
          });

          if (!retryResponse.ok) {
            throw new Error('Failed to start playback via SDK after transfer');
          }
        } else {
          throw new Error('Failed to start playback via SDK');
        }
      }
    } else if (this.mode === 'connect') {
      // Use Connect API (fallback)
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
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
    } else {
      throw new Error('Player not initialized');
    }
  }

  async togglePlay(): Promise<void> {
    if (this.mode === 'sdk' && this.player) {
      await this.player.togglePlay();
    }
  }

  async seek(positionMs: number): Promise<void> {
    if (this.mode === 'sdk' && this.player) {
      await this.player.seek(positionMs);
    }
  }

  private async activateDevice(deviceId: string): Promise<void> {
    const tokens = getStoredTokens();
    if (!tokens) {
      throw new Error('Cannot activate device: no tokens');
    }

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_ids: [deviceId],
        play: false,
      }),
    });

    // 404 is okay here - it means no prior playback session
    if (!response.ok && response.status !== 404) {
      console.warn('Failed to activate device, status:', response.status);
    }
  }

  private async getActiveDeviceId(): Promise<string> {
    const tokens = getStoredTokens();
    if (!tokens) {
      throw new Error('Cannot get device ID: no tokens');
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch devices');
    }

    const data = await response.json();

    // Find our device (Music League Helper)
    const ourDevice = data.devices.find((d: any) => d.name === 'Music League Helper');

    if (!ourDevice) {
      throw new Error('Could not find Music League Helper device');
    }

    return ourDevice.id;
  }

  private async transferPlayback(): Promise<void> {
    if (!this.deviceId) {
      throw new Error('No device ID available for transfer');
    }
    await this.activateDevice(this.deviceId);
  }

  getMode(): PlaybackMode {
    return this.mode;
  }

  async getAvailableDevices(): Promise<SpotifyDevice[]> {
    const tokens = getStoredTokens();
    if (!tokens) {
      throw new Error('No authentication tokens');
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch devices');
    }

    const data = await response.json();
    return data.devices;
  }

  async getCurrentPlaybackState(): Promise<PlayerState | null> {
    const tokens = getStoredTokens();
    if (!tokens) {
      return null;
    }

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (response.status === 204 || !response.ok) {
      // No active playback
      return null;
    }

    const data = await response.json();

    if (!data.item) {
      return null;
    }

    // Convert Spotify API response to PlayerState format
    return {
      paused: !data.is_playing,
      position: data.progress_ms,
      duration: data.item.duration_ms,
      track_window: {
        current_track: {
          id: data.item.id,
          name: data.item.name,
          artists: data.item.artists.map((a: any) => ({ name: a.name })),
          album: {
            name: data.item.album.name,
            images: data.item.album.images,
          },
          uri: data.item.uri,
        },
      },
    };
  }

  startPolling(intervalMs: number = 3000): void {
    if (this.pollingInterval !== null) {
      return; // Already polling
    }

    this.pollingInterval = window.setInterval(async () => {
      const state = await this.getCurrentPlaybackState();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(state);
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  async transferPlaybackToDevice(deviceId: string): Promise<void> {
    const tokens = getStoredTokens();
    if (!tokens) {
      throw new Error('No authentication tokens');
    }

    const response = await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_ids: [deviceId],
        play: true,
      }),
    });

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to transfer playback');
    }

    // Update our device ID if transferring to our SDK device
    if (this.mode === 'sdk') {
      const devices = await this.getAvailableDevices();
      const ourDevice = devices.find(d => d.name === 'Music League Helper');
      if (ourDevice && ourDevice.id === deviceId) {
        this.deviceId = deviceId;
      }
    }
  }

  disconnect(): void {
    this.stopPolling();
    if (this.player) {
      this.player.disconnect();
      this.player = null;
      this.deviceId = null;
      this.mode = null;
    }
  }
}

export const playerManager = new SpotifyPlayerManager();

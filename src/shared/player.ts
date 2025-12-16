import { getStoredTokens, getStoredTokensSync } from './spotify-auth';

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
  private hasLocalPlayback: boolean = false;

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

      const tokens = getStoredTokensSync();
      if (!tokens) {
        reject(new Error('No access token'));
        return;
      }

      this.player = new window.Spotify.Player({
        name: 'Music League Helper',
        getOAuthToken: (cb) => {
          const tokens = getStoredTokensSync();
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
      this.player.addListener('ready', ({ device_id }) => {
        console.log('Spotify Web Playback SDK ready with Device ID:', device_id);

        // Store device ID but DON'T activate it yet
        // Only activate when user actually wants to play something
        // This prevents interrupting playback on other devices
        this.deviceId = device_id;
        console.log('SDK device ready (not activated yet):', this.deviceId);

        resolve('sdk');
      });

      // Player state updates
      this.player.addListener('player_state_changed', (state) => {
        // Track if we have local playback
        const hasPlayback = state !== null && state.track_window?.current_track !== null;

        // If we just got local playback, stop polling (SDK will handle updates)
        if (hasPlayback && !this.hasLocalPlayback) {
          console.log('Local playback detected, stopping API polling');
          this.stopPolling();
        }
        // If we lost local playback, start polling (to detect playback on other devices)
        else if (!hasPlayback && this.hasLocalPlayback) {
          console.log('Local playback ended, resuming API polling');
          this.startPolling(10000);
        }

        this.hasLocalPlayback = hasPlayback;

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
    const tokens = await getStoredTokens();
    if (!tokens) {
      throw new Error('No authentication tokens');
    }

    // First, check if there's already an active device with playback
    const devices = await this.getAvailableDevices();
    const activeDevice = devices.find(d => d.is_active);

    if (activeDevice) {
      // There's already an active device - play on that device
      console.log('Found active device, playing on:', activeDevice.name);
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

      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to start playback on active device');
      }
    } else {
      // No active device - use our local device (SDK or Connect mode)
      console.log('No active device found, playing locally');

      if (this.mode === 'sdk' && this.deviceId) {
        // Try playing on our SDK device
        let response = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + this.deviceId, {
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
          // Device not found - need to discover and activate it
          if (response.status === 404) {
            console.log('Device not found via SDK ID, discovering via API...');

            // Wait for device to register
            await new Promise(resolve => setTimeout(resolve, 500));

            // Find our device via the API
            const apiDeviceId = await this.findOurDeviceId();

            if (apiDeviceId) {
              console.log('Found device via API:', apiDeviceId);
              this.deviceId = apiDeviceId;

              // Activate the device
              await this.transferPlayback();
              await new Promise(resolve => setTimeout(resolve, 1000));

              // Retry playback
              response = await fetch('https://api.spotify.com/v1/me/player/play?device_id=' + this.deviceId, {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${tokens.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  uris: [trackUri],
                }),
              });

              if (!response.ok && response.status !== 204) {
                const retryError = await response.json();
                console.error('Retry playback error:', retryError);
                throw new Error('Failed to start playback. Please try again.');
              }
            } else {
              throw new Error('Could not find playback device. Please refresh the page.');
            }
          } else {
            throw new Error('Failed to start playback via SDK');
          }
        }
      } else if (this.mode === 'connect') {
        // Use Connect API (fallback) - play on any available device
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

    // Immediately poll to update UI, then start fast polling for quick updates
    await this.pollOnce();
    this.startFastPolling(10000); // Fast polling for 10 seconds
  }

  async togglePlay(): Promise<void> {
    const tokens = await getStoredTokens();
    if (!tokens) {
      throw new Error('No authentication tokens');
    }

    // Check if we have local playback
    if (this.mode === 'sdk' && this.player && this.hasLocalPlayback) {
      // Use SDK for local playback
      await this.player.togglePlay();
    } else {
      // Use Web API for remote playback or Connect mode
      const currentState = await this.getCurrentPlaybackState();
      if (!currentState) {
        throw new Error('No active playback');
      }

      const endpoint = currentState.paused
        ? 'https://api.spotify.com/v1/me/player/play'
        : 'https://api.spotify.com/v1/me/player/pause';

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to toggle playback');
      }

      // Immediately poll to update UI
      const state = await this.getCurrentPlaybackState();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(state);
      }
    }
  }

  async seek(positionMs: number): Promise<void> {
    if (this.mode === 'sdk' && this.player) {
      await this.player.seek(positionMs);
    }
  }

  private async activateDevice(deviceId: string): Promise<void> {
    const tokens = await getStoredTokens();
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

  private async findOurDeviceId(): Promise<string | null> {
    try {
      const devices = await this.getAvailableDevices();
      const ourDevice = devices.find(d => d.name === 'Music League Helper');
      return ourDevice?.id || null;
    } catch (err) {
      console.error('Failed to find device:', err);
      return null;
    }
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

  getCurrentDeviceId(): string | null {
    return this.deviceId;
  }

  async getAvailableDevices(): Promise<SpotifyDevice[]> {
    const tokens = await getStoredTokens();
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
    const tokens = await getStoredTokens();
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

  startPolling(intervalMs: number = 10000): void {
    if (this.pollingInterval !== null) {
      return; // Already polling
    }

    console.log(`Starting API polling every ${intervalMs}ms`);
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

  async pollOnce(): Promise<void> {
    const state = await this.getCurrentPlaybackState();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(state);
    }
  }

  startFastPolling(durationMs: number = 10000): void {
    // Stop regular polling
    this.stopPolling();

    // Start fast polling (2 seconds)
    console.log('Starting fast polling for', durationMs, 'ms');
    this.startPolling(2000);

    // After duration, switch back to normal polling
    setTimeout(() => {
      this.stopPolling();
      this.startPolling(10000);
      console.log('Switched back to normal polling');
    }, durationMs);
  }

  async transferPlaybackToDevice(deviceId: string): Promise<void> {
    const tokens = await getStoredTokens();
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

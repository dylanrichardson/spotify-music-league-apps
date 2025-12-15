import { useState, useEffect } from 'react';
import { playerManager, type SpotifyDevice } from './player';

export function PlaybackBar() {
  const [playerState, setPlayerState] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<SpotifyDevice[]>([]);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  useEffect(() => {
    initializePlayer();
    loadDevices();

    return () => {
      playerManager.disconnect();
    };
  }, []);

  const initializePlayer = async () => {
    try {
      const mode = await playerManager.initialize((state) => {
        setPlayerState(state);
        setIsPlaying(!state?.paused);
      });
      console.log('Playback mode:', mode === 'sdk' ? 'Web Playback SDK (Premium)' : 'Spotify Connect (Fallback)');

      // Get our device ID to identify "This Tab"
      const deviceId = playerManager.getCurrentDeviceId();
      setCurrentDeviceId(deviceId);

      // Start polling for playback state to detect playback on other devices
      // SDK mode: Will auto-stop polling when local playback starts
      // Connect mode: Will continue polling
      playerManager.startPolling();
    } catch (err) {
      console.error('Failed to initialize player:', err);
      // Still start polling even if SDK fails (Connect mode fallback)
      playerManager.startPolling();
    }
  };

  const loadDevices = async () => {
    try {
      const devices = await playerManager.getAvailableDevices();
      setAvailableDevices(devices);
    } catch (err) {
      console.error('Failed to load devices:', err);
    }
  };

  const handleDeviceChange = async (deviceId: string) => {
    try {
      await playerManager.transferPlaybackToDevice(deviceId);
      setShowDeviceSelector(false);
      // Reload devices to update active state
      await loadDevices();
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Failed to switch device');
    }
  };

  const handleTogglePlay = async () => {
    try {
      await playerManager.togglePlay();
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Failed to toggle playback');
    }
  };

  // Don't render anything if there's no active track
  if (!playerState?.track_window?.current_track) {
    return null;
  }

  return (
    <>
      {/* Playback Error */}
      {playbackError && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 max-w-md shadow-lg">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-red-800 font-medium">{playbackError}</p>
          </div>
          <button
            onClick={() => setPlaybackError(null)}
            className="text-red-600 hover:text-red-700"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Mini Player */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-gray-900 to-gray-800 border-t border-gray-700 shadow-2xl">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Album Cover */}
            {playerState.track_window.current_track.album.images[0] && (
              <img
                src={playerState.track_window.current_track.album.images[0].url}
                alt={playerState.track_window.current_track.album.name}
                className="w-14 h-14 rounded shadow-lg hidden sm:block"
              />
            )}

            {/* Track Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white text-sm truncate">
                {playerState.track_window.current_track.name}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {playerState.track_window.current_track.artists.map((a: any) => a.name).join(', ')}
              </div>
              {/* Progress bar */}
              <div className="mt-1 bg-gray-700 rounded-full h-1 hidden md:block">
                <div
                  className="bg-green-500 h-1 rounded-full transition-all"
                  style={{
                    width: `${(playerState.position / playerState.duration) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Play/Pause Button */}
            <button
              onClick={handleTogglePlay}
              className="bg-white text-gray-900 rounded-full p-3 hover:scale-105 transition-transform shadow-lg"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Device Selector */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowDeviceSelector(!showDeviceSelector);
                  if (!showDeviceSelector) loadDevices();
                }}
                className="bg-gray-700 text-gray-200 rounded-full p-3 hover:bg-gray-600 transition-colors shadow-lg"
                title="Select playback device"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
              </button>

              {/* Device Dropdown */}
              {showDeviceSelector && (
                <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-2xl border border-gray-700 min-w-64 max-w-xs z-50">
                  <div className="p-2 border-b border-gray-700">
                    <div className="text-xs font-semibold text-gray-400 px-2 py-1">Select a device</div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {availableDevices.length === 0 ? (
                      <div className="p-4 text-sm text-gray-400 text-center">
                        No devices found
                      </div>
                    ) : (
                      // Sort devices: This tab first, then other "Music League Helper" devices, then others
                      availableDevices
                        .sort((a, b) => {
                          const aIsThisTab = a.id === currentDeviceId;
                          const bIsThisTab = b.id === currentDeviceId;
                          if (aIsThisTab && !bIsThisTab) return -1;
                          if (!aIsThisTab && bIsThisTab) return 1;

                          // Among non-this-tab devices, sort Music League Helper first
                          const aIsHelper = a.name === 'Music League Helper';
                          const bIsHelper = b.name === 'Music League Helper';
                          if (aIsHelper && !bIsHelper) return -1;
                          if (!aIsHelper && bIsHelper) return 1;
                          return 0;
                        })
                        .map((device) => {
                          const isThisTab = device.id === currentDeviceId;
                          return (
                            <button
                              key={device.id}
                              onClick={() => handleDeviceChange(device.id)}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors flex items-center gap-3 ${
                                device.is_active ? 'bg-gray-700' : ''
                              } ${isThisTab ? 'border-b-2 border-gray-600' : ''}`}
                            >
                              <svg className={`w-5 h-5 flex-shrink-0 ${isThisTab ? 'text-blue-400' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="text-sm text-white truncate">{device.name}</div>
                                  {isThisTab && (
                                    <span className="text-xs font-semibold text-blue-400 bg-blue-900 px-2 py-0.5 rounded-full whitespace-nowrap">
                                      This Tab
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400">{device.type}</div>
                              </div>
                              {device.is_active && (
                                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Active Device Indicator */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {availableDevices.find(d => d.is_active)?.name || 'No active device'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

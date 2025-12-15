import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchLibraryTracks,
  fetchUserPlaylists,
  fetchPlaylistTracks,
  resyncLibrary,
  resyncPlaylists,
  getLibraryLastSync,
  getPlaylistsLastSync,
  fetchUserProfile,
} from '../../../shared/spotify-api';
import { logout } from '../../../shared/spotify-auth';
import type { SpotifyTrack, SpotifyPlaylist, UserProfile } from '../../../rounds/types';
import { playerManager, type PlaybackMode } from '../../../shared/player';

// Filter tracks by release year range
function filterTracksByYears(tracks: SpotifyTrack[], startYear: number, endYear: number): SpotifyTrack[] {
  return tracks.filter((track) => {
    const releaseDate = track.album.release_date;
    const year = parseInt(releaseDate.split('-')[0]);
    return year >= startYear && year <= endYear;
  });
}

// Get exact birth year as a single year range
function getYearRange(birthYear: number): { start: number; end: number } {
  return {
    start: birthYear,
    end: birthYear,
  };
}

export function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [birthYear, setBirthYear] = useState('1960');
  const [filteredTracks, setFilteredTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('library');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'year' | 'artist' | 'name' | 'album'>('year');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(null);
  const [playerState, setPlayerState] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [syncingLibrary, setSyncingLibrary] = useState(false);
  const [syncingPlaylists, setSyncingPlaylists] = useState(false);
  const [libraryLastSync, setLibraryLastSync] = useState<number | null>(null);
  const [playlistsLastSync, setPlaylistsLastSync] = useState<number | null>(null);

  useEffect(() => {
    loadProfile();
    loadPlaylists();
    initializePlayer();
    updateLastSyncTimes();

    return () => {
      playerManager.disconnect();
    };
  }, []);

  const updateLastSyncTimes = async () => {
    const libSync = await getLibraryLastSync();
    const playlistSync = await getPlaylistsLastSync();
    setLibraryLastSync(libSync);
    setPlaylistsLastSync(playlistSync);
  };

  const initializePlayer = async () => {
    try {
      const mode = await playerManager.initialize((state) => {
        setPlayerState(state);
        setIsPlaying(!state?.paused);
        if (state?.track_window?.current_track) {
          setPlayingTrackId(state.track_window.current_track.id);
        }
      });
      setPlaybackMode(mode);
      console.log('Playback mode:', mode === 'sdk' ? 'Web Playback SDK (Premium)' : 'Spotify Connect (Fallback)');
    } catch (err) {
      console.error('Failed to initialize player:', err);
      setPlaybackMode('connect');
    }
  };

  const loadProfile = async () => {
    try {
      const userProfile = await fetchUserProfile();
      setProfile(userProfile);
    } catch (err) {
      setError('Failed to load profile');
      console.error(err);
    }
  };

  const loadPlaylists = async () => {
    try {
      const userPlaylists = await fetchUserPlaylists();
      setPlaylists(userPlaylists);
      updateLastSyncTimes();
    } catch (err) {
      console.error('Failed to load playlists:', err);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const handleResyncLibrary = async () => {
    setSyncingLibrary(true);
    setError(null);

    try {
      const { added, removed } = await resyncLibrary((current, total) => {
        setProgress({ current, total });
      });

      console.log(`Library resynced: ${added.length} added, ${removed.length} removed`);

      // Update filtered tracks if library was the selected source
      if (selectedPlaylist === 'library' && filteredTracks.length > 0) {
        // Remove deleted tracks from filtered results
        const removedSet = new Set(removed);
        setFilteredTracks(prev => prev.filter(track => !removedSet.has(track.id)));
      }

      updateLastSyncTimes();
    } catch (err) {
      setError('Failed to resync library. Please try again.');
      console.error(err);
    } finally {
      setSyncingLibrary(false);
    }
  };

  const handleResyncPlaylists = async () => {
    setSyncingPlaylists(true);
    setError(null);

    try {
      const freshPlaylists = await resyncPlaylists();
      setPlaylists(freshPlaylists);
      updateLastSyncTimes();
      console.log('Playlists resynced');
    } catch (err) {
      setError('Failed to resync playlists. Please try again.');
      console.error(err);
    } finally {
      setSyncingPlaylists(false);
    }
  };

  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';

    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleSort = (field: 'year' | 'artist' | 'name' | 'album') => {
    if (sortBy === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to ascending
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  const getSortedTracks = (tracks: SpotifyTrack[]) => {
    const sorted = [...tracks];
    const multiplier = sortDirection === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'year':
        return sorted.sort((a, b) => a.album.release_date.localeCompare(b.album.release_date) * multiplier);
      case 'artist':
        return sorted.sort((a, b) => {
          const aArtist = a.artists[0]?.name || '';
          const bArtist = b.artists[0]?.name || '';
          return aArtist.localeCompare(bArtist) * multiplier;
        });
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name) * multiplier);
      case 'album':
        return sorted.sort((a, b) => a.album.name.localeCompare(b.album.name) * multiplier);
      default:
        return sorted;
    }
  };

  const handlePlayTrack = async (track: SpotifyTrack) => {
    setPlaybackError(null);
    setPlayingTrackId(track.id);

    try {
      await playerManager.playTrack(track.uri);
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Failed to play track');
      setPlayingTrackId(null);
      console.error('Playback error:', err);
    }
  };

  const handleTogglePlay = async () => {
    try {
      await playerManager.togglePlay();
    } catch (err) {
      setPlaybackError(err instanceof Error ? err.message : 'Failed to toggle playback');
    }
  };

  const handleFilter = async () => {
    if (!birthYear) {
      setError('Please enter a birth year');
      return;
    }

    const year = parseInt(birthYear);

    if (isNaN(year)) {
      setError('Please enter a valid year');
      return;
    }

    setLoading(true);
    setError(null);
    setFilteredTracks([]);
    setProgress({ current: 0, total: 0 });

    try {
      const yearRange = getYearRange(year);
      const matchedIds = new Set<string>();

      const handleProgress = (current: number, total: number, newTracks: SpotifyTrack[]) => {
        setProgress({ current, total });

        // Filter new tracks and add them progressively
        const matches = filterTracksByYears(newTracks, yearRange.start, yearRange.end);

        const newMatches: SpotifyTrack[] = [];
        matches.forEach((track) => {
          if (!matchedIds.has(track.id)) {
            matchedIds.add(track.id);
            newMatches.push(track);
          }
        });

        if (newMatches.length > 0) {
          setFilteredTracks((prev) => {
            const combined = [...prev, ...newMatches];
            // Sort by release date
            combined.sort((a, b) => a.album.release_date.localeCompare(b.album.release_date));
            return combined;
          });
        }
      };

      if (selectedPlaylist === 'library') {
        setLoadingLibrary(true);
        await fetchLibraryTracks(handleProgress);
        setLoadingLibrary(false);
      } else {
        await fetchPlaylistTracks(selectedPlaylist, handleProgress);
      }
    } catch (err) {
      setError('Failed to fetch tracks. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingLibrary(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500">
      <div className={`container mx-auto px-4 py-4 md:py-8 ${playbackMode === 'sdk' && playerState?.track_window?.current_track ? 'pb-24' : ''}`}>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-4 md:p-6 mb-4 md:mb-8 max-w-4xl mx-auto">
          {/* Top bar: Profile + Navigation */}
          <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200 gap-3">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              {profile?.images?.[0]?.url && (
                <img
                  src={profile.images[0].url}
                  alt={profile.display_name}
                  className="w-8 h-8 md:w-10 md:h-10 rounded-full flex-shrink-0"
                />
              )}
              <span className="text-xs md:text-base text-gray-700 font-medium truncate">
                {profile?.display_name || 'User'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                to="/"
                className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-3 md:px-6 rounded-full transition-colors text-xs md:text-base whitespace-nowrap"
              >
                ← Home
              </Link>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-3 md:px-6 rounded-full transition-colors text-xs md:text-base"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Round Title */}
          <div className="text-center pt-2">
            <div className="inline-block bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full mb-3">
              ROUND 5
            </div>
            <h1 className="text-xl md:text-3xl font-bold text-gray-900 mb-2">
              Songs released in your parents birth year
            </h1>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white rounded-lg shadow-xl p-4 md:p-8 mb-4 md:mb-8 max-w-4xl mx-auto">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 md:mb-6 text-center">
            Enter Birth Year
          </h2>

          <div className="flex flex-col gap-4 md:gap-6 mb-4 md:mb-6 max-w-md mx-auto">
            {/* Birth Year */}
            <div>
              <div className="relative">
                <div className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-3xl md:text-4xl">
                  🎂
                </div>
                <input
                  type="number"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  min="1900"
                  max="2024"
                  className="w-full pl-14 md:pl-16 pr-3 md:pr-4 py-3 md:py-4 text-lg md:text-xl font-semibold border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-green-300 focus:border-green-500 transition-all shadow-sm hover:shadow-md"
                />
                <label className="absolute -top-3 left-12 md:left-14 bg-white px-2 text-xs md:text-sm font-semibold text-gray-700">
                  Birth Year
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Enter any year between 1900 and 2024
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-3">Source</label>

            {/* My Library Option */}
            <div
              className={`rounded-lg border-2 mb-3 transition-all ${
                selectedPlaylist === 'library'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200'
              }`}
            >
              <div
                onClick={() => setSelectedPlaylist('library')}
                className="flex items-center gap-3 p-4 cursor-pointer"
              >
                <input
                  type="radio"
                  checked={selectedPlaylist === 'library'}
                  onChange={() => setSelectedPlaylist('library')}
                  className="w-4 h-4 text-green-600"
                />
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">My Library</div>
                  <div className="text-sm text-gray-500">All your saved songs</div>
                </div>
                <div className="text-2xl">💿</div>
              </div>
              <div className="px-4 pb-3 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  Last synced: {formatLastSync(libraryLastSync)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResyncLibrary();
                  }}
                  disabled={syncingLibrary}
                  className="text-xs text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50 flex items-center gap-1"
                >
                  {syncingLibrary ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      Syncing...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Resync
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Playlists Loading */}
            {loadingPlaylists && (
              <div className="border-t-2 border-gray-200 pt-4">
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  <span className="text-sm text-gray-600">Loading your playlists...</span>
                </div>
              </div>
            )}

            {/* Playlists Section */}
            {!loadingPlaylists && playlists.length > 0 && (
              <div className="border-t-2 border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-700">Or choose a playlist</span>
                  <span className="text-xs text-gray-500">{playlists.length} playlists</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-500">
                    Last synced: {formatLastSync(playlistsLastSync)}
                  </span>
                  <button
                    onClick={handleResyncPlaylists}
                    disabled={syncingPlaylists}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50 flex items-center gap-1"
                  >
                    {syncingPlaylists ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                        Syncing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Resync
                      </>
                    )}
                  </button>
                </div>

                {/* Search Input */}
                {playlists.length > 5 && (
                  <input
                    type="text"
                    placeholder="Search playlists..."
                    value={playlistSearch}
                    onChange={(e) => setPlaylistSearch(e.target.value)}
                    className="w-full px-3 py-2 mb-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-500"
                  />
                )}

                {/* Playlists List */}
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {playlists
                    .filter((playlist) =>
                      playlist.name.toLowerCase().includes(playlistSearch.toLowerCase())
                    )
                    .map((playlist) => (
                      <div
                        key={playlist.id}
                        onClick={() => setSelectedPlaylist(playlist.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedPlaylist === playlist.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          checked={selectedPlaylist === playlist.id}
                          onChange={() => setSelectedPlaylist(playlist.id)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-800 truncate">
                            {playlist.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {playlist.tracks.total} tracks
                          </div>
                        </div>
                      </div>
                    ))}
                  {playlists.filter((playlist) =>
                    playlist.name.toLowerCase().includes(playlistSearch.toLowerCase())
                  ).length === 0 && (
                    <div className="text-center py-4 text-sm text-gray-500">
                      No playlists found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-red-600 mb-4">{error}</p>}

          <button
            onClick={handleFilter}
            disabled={loading || !birthYear}
            className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-bold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {loadingLibrary ? 'Loading library...' : 'Filtering...'}
              </span>
            ) : (
              'Find Songs'
            )}
          </button>

          {/* Progress Bar */}
          {(loading || syncingLibrary) && progress.total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{syncingLibrary ? 'Syncing library...' : 'Processing tracks...'}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-green-500 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {filteredTracks.length > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-4 md:p-6">
            <div className="flex flex-col gap-3 mb-4 md:mb-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <span>Found {filteredTracks.length} songs</span>
                  {loading && (
                    <span className="text-xs md:text-sm font-normal text-gray-500">(searching...)</span>
                  )}
                </h2>

                {/* View Toggle - Icons only */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'list'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="List view"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-md transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                    title="Grid view"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Playback Error */}
              {playbackError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
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

              {/* Sort buttons - visible on mobile */}
              {viewMode === 'list' && (
                <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                  <button
                    onClick={() => handleSort('year')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      sortBy === 'year'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Year {sortBy === 'year' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button
                    onClick={() => handleSort('name')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      sortBy === 'name'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Song {sortBy === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button
                    onClick={() => handleSort('artist')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      sortBy === 'artist'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Artist {sortBy === 'artist' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                  <button
                    onClick={() => handleSort('album')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      sortBy === 'album'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Album {sortBy === 'album' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'list' ? (
              <>
                {/* Mobile List View */}
                <div className="md:hidden space-y-0">
                  {getSortedTracks(filteredTracks).map((track) => (
                    <div key={track.id} className="border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-3 py-3 px-2">
                        {/* Clickable area for playback */}
                        <button
                          onClick={() => handlePlayTrack(track)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          {/* Album Cover */}
                          {track.album.images[0] && (
                            <div className="relative">
                              <img
                                src={track.album.images[0].url}
                                alt={track.album.name}
                                className="w-12 h-12 rounded object-contain bg-gray-100 flex-shrink-0"
                              />
                              {/* Play indicator */}
                              {playingTrackId === track.id && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Song & Artist stacked */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900 truncate">
                              {track.name}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {track.artists.map((a) => a.name).join(', ')}
                            </div>
                          </div>

                          {/* Year */}
                          <div className="text-xs text-gray-600 font-medium flex-shrink-0">
                            {track.album.release_date.split('-')[0]}
                          </div>
                        </button>

                        {/* Expand button */}
                        <button
                          onClick={() => setExpandedTrack(expandedTrack === track.id ? null : track.id)}
                          className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                          </svg>
                        </button>
                      </div>

                      {/* Expanded Details */}
                      {expandedTrack === track.id && (
                        <div className="px-2 pb-3 pt-0 bg-gray-50">
                          <div className="text-xs text-gray-600 mb-2">
                            <span className="font-semibold">Album:</span> {track.album.name}
                          </div>
                          <a
                            href={`https://open.spotify.com/track/${track.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700"
                          >
                            Open in Spotify
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-3 px-4 w-12"></th>
                        <th
                          className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Song
                            {sortBy === 'name' && <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                          onClick={() => handleSort('artist')}
                        >
                          <div className="flex items-center gap-1">
                            Artist
                            {sortBy === 'artist' && <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                          onClick={() => handleSort('album')}
                        >
                          <div className="flex items-center gap-1">
                            Album
                            {sortBy === 'album' && <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th
                          className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-20 cursor-pointer hover:bg-gray-50 select-none"
                          onClick={() => handleSort('year')}
                        >
                          <div className="flex items-center gap-1">
                            Year
                            {sortBy === 'year' && <span className="text-blue-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        </th>
                        <th className="py-3 px-4 w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSortedTracks(filteredTracks).map((track) => (
                        <tr
                          key={track.id}
                          onClick={() => handlePlayTrack(track)}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer"
                        >
                          <td className="py-2 px-4">
                            {track.album.images[0] && (
                              <div className="relative">
                                <img
                                  src={track.album.images[0].url}
                                  alt={track.album.name}
                                  className="w-10 h-10 rounded object-contain bg-gray-100"
                                />
                                {playingTrackId === track.id && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-4 text-sm font-medium text-gray-800 truncate max-w-xs">
                            {track.name}
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-600 truncate max-w-xs">
                            {track.artists.map((a) => a.name).join(', ')}
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-500 truncate max-w-xs">
                            {track.album.name}
                          </td>
                          <td className="py-2 px-4 text-sm text-gray-500">
                            {track.album.release_date.split('-')[0]}
                          </td>
                          <td className="py-2 px-4">
                            <a
                              href={`https://open.spotify.com/track/${track.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-green-600 hover:text-green-700 font-semibold opacity-0 group-hover:opacity-100 transition-opacity inline-block"
                            >
                              Open ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getSortedTracks(filteredTracks).map((track) => (
                  <div
                    key={track.id}
                    onClick={() => handlePlayTrack(track)}
                    className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="flex gap-3">
                      {track.album.images[0] && (
                        <div className="relative flex-shrink-0">
                          <img
                            src={track.album.images[0].url}
                            alt={track.album.name}
                            className="w-16 h-16 rounded"
                          />
                          {playingTrackId === track.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded">
                              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 truncate">
                          {track.name}
                        </h3>
                        <p className="text-sm text-gray-600 truncate">
                          {track.artists.map((a) => a.name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {track.album.name} ({track.album.release_date.split('-')[0]})
                        </p>
                        <a
                          href={`https://open.spotify.com/track/${track.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-green-600 hover:text-green-700 font-semibold"
                        >
                          Open in Spotify
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && filteredTracks.length === 0 && progress.total > 0 && (
          <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 text-center">
            <p className="text-gray-600 text-base md:text-lg">
              No songs found from {birthYear} in your{' '}
              {selectedPlaylist === 'library' ? 'library' : 'selected playlist'}.
            </p>
            <p className="text-gray-500 text-xs md:text-sm mt-2">
              Searched {progress.total} tracks
            </p>
          </div>
        )}
      </div>

      {/* Mini Player - Only shown for SDK mode */}
      {playbackMode === 'sdk' && playerState?.track_window?.current_track && (
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

              {/* Mode indicator */}
              <div className="hidden lg:flex items-center gap-2 text-xs text-gray-400 bg-gray-800 px-3 py-1.5 rounded-full">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Playing in browser
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

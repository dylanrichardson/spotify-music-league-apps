import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchLibraryTracks,
  fetchUserPlaylists,
  fetchPlaylistTracks,
  filterTracksByYears,
  getYearRange,
} from '../spotify-api';
import { fetchUserProfile } from '../spotify-api';
import { logout } from '../spotify-auth';
import type { SpotifyTrack, SpotifyPlaylist, UserProfile } from '../types';

export function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dadBirthYear, setDadBirthYear] = useState('1960');
  const [momBirthYear, setMomBirthYear] = useState('1963');
  const [filteredTracks, setFilteredTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('library');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'year' | 'artist' | 'name' | 'album'>('year');
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);

  useEffect(() => {
    loadProfile();
    loadPlaylists();
  }, []);

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
    } catch (err) {
      console.error('Failed to load playlists:', err);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const getSortedTracks = (tracks: SpotifyTrack[]) => {
    const sorted = [...tracks];
    switch (sortBy) {
      case 'year':
        return sorted.sort((a, b) => a.album.release_date.localeCompare(b.album.release_date));
      case 'artist':
        return sorted.sort((a, b) => {
          const aArtist = a.artists[0]?.name || '';
          const bArtist = b.artists[0]?.name || '';
          return aArtist.localeCompare(bArtist);
        });
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'album':
        return sorted.sort((a, b) => a.album.name.localeCompare(b.album.name));
      default:
        return sorted;
    }
  };

  const handleFilter = async () => {
    if (!dadBirthYear || !momBirthYear) {
      setError('Please enter both birth years');
      return;
    }

    const dadYear = parseInt(dadBirthYear);
    const momYear = parseInt(momBirthYear);

    if (isNaN(dadYear) || isNaN(momYear)) {
      setError('Please enter valid years');
      return;
    }

    setLoading(true);
    setError(null);
    setFilteredTracks([]);
    setProgress({ current: 0, total: 0 });

    try {
      const dadRange = getYearRange(dadYear);
      const momRange = getYearRange(momYear);
      const matchedIds = new Set<string>();

      const handleProgress = (current: number, total: number, newTracks: SpotifyTrack[]) => {
        setProgress({ current, total });

        // Filter new tracks and add them progressively
        const dadMatches = filterTracksByYears(newTracks, dadRange.start, dadRange.end);
        const momMatches = filterTracksByYears(newTracks, momRange.start, momRange.end);

        const newMatches: SpotifyTrack[] = [];
        [...dadMatches, ...momMatches].forEach((track) => {
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
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-8 max-w-4xl mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {profile?.images?.[0]?.url && (
                <img
                  src={profile.images[0].url}
                  alt={profile.display_name}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Parents' Birth Year Finder
                </h1>
                <p className="text-gray-600">Welcome, {profile?.display_name || 'User'}!</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-full transition-colors"
              >
                ← Home
              </Link>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-6 rounded-full transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="bg-white rounded-lg shadow-xl p-8 mb-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Enter Birth Years
          </h2>

          <div className="flex flex-col md:flex-row gap-6 mb-6 max-w-2xl mx-auto">
            {/* Dad's Birth Year */}
            <div className="flex-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl">
                  👨
                </div>
                <input
                  type="number"
                  value={dadBirthYear}
                  onChange={(e) => setDadBirthYear(e.target.value)}
                  min="1900"
                  max="2024"
                  className="w-full pl-16 pr-4 py-4 text-xl font-semibold border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-blue-300 focus:border-blue-500 transition-all shadow-sm hover:shadow-md"
                />
                <label className="absolute -top-3 left-14 bg-white px-2 text-sm font-semibold text-gray-700">
                  Dad's Birth Year
                </label>
              </div>
            </div>

            {/* Mom's Birth Year */}
            <div className="flex-1">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl">
                  👩
                </div>
                <input
                  type="number"
                  value={momBirthYear}
                  onChange={(e) => setMomBirthYear(e.target.value)}
                  min="1900"
                  max="2024"
                  className="w-full pl-16 pr-4 py-4 text-xl font-semibold border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-pink-300 focus:border-pink-500 transition-all shadow-sm hover:shadow-md"
                />
                <label className="absolute -top-3 left-14 bg-white px-2 text-sm font-semibold text-gray-700">
                  Mom's Birth Year
                </label>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-3">Source</label>

            {/* My Library Option */}
            <div
              onClick={() => setSelectedPlaylist('library')}
              className={`flex items-center gap-3 p-4 mb-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedPlaylist === 'library'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
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
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700">Or choose a playlist</span>
                  <span className="text-xs text-gray-500">{playlists.length} playlists</span>
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
            disabled={loading || !dadBirthYear || !momBirthYear}
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
          {loading && progress.total > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Processing tracks...</span>
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
          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <span>Found {filteredTracks.length} songs</span>
                {loading && (
                  <span className="text-sm font-normal text-gray-500">(searching...)</span>
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

            {viewMode === 'list' ? (
              /* List View - Table */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="py-3 px-4 w-12"></th>
                      <th
                        className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => setSortBy('name')}
                      >
                        <div className="flex items-center gap-1">
                          Song
                          {sortBy === 'name' && <span className="text-blue-600">↓</span>}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => setSortBy('artist')}
                      >
                        <div className="flex items-center gap-1">
                          Artist
                          {sortBy === 'artist' && <span className="text-blue-600">↓</span>}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => setSortBy('album')}
                      >
                        <div className="flex items-center gap-1">
                          Album
                          {sortBy === 'album' && <span className="text-blue-600">↓</span>}
                        </div>
                      </th>
                      <th
                        className="text-left py-3 px-4 text-sm font-semibold text-gray-700 w-20 cursor-pointer hover:bg-gray-50 select-none"
                        onClick={() => setSortBy('year')}
                      >
                        <div className="flex items-center gap-1">
                          Year
                          {sortBy === 'year' && <span className="text-blue-600">↓</span>}
                        </div>
                      </th>
                      <th className="py-3 px-4 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedTracks(filteredTracks).map((track) => (
                      <tr
                        key={track.id}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors group"
                      >
                        <td className="py-2 px-4">
                          {track.album.images[0] && (
                            <img
                              src={track.album.images[0].url}
                              alt={track.album.name}
                              className="w-10 h-10 rounded object-cover"
                            />
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
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {getSortedTracks(filteredTracks).map((track) => (
                  <div
                    key={track.id}
                    className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex gap-3">
                      {track.album.images[0] && (
                        <img
                          src={track.album.images[0].url}
                          alt={track.album.name}
                          className="w-16 h-16 rounded"
                        />
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
          <div className="bg-white rounded-lg shadow-xl p-8 text-center">
            <p className="text-gray-600 text-lg">
              No songs found from {dadBirthYear} or {momBirthYear} in your{' '}
              {selectedPlaylist === 'library' ? 'library' : 'selected playlist'}.
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Searched {progress.total} tracks
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

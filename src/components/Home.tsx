import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ROUNDS } from '../rounds/config';
import { getStoredTokens, logout } from '../shared/spotify-auth';
import { fetchUserProfile } from '../shared/spotify-api';
import type { UserProfile } from '../rounds/types';

const ROUND_EMOJIS: Record<number, string> = {
  1: '⏱️',
  2: '💎',
  3: '🎺',
  4: '🏎️',
  5: '👨‍👩‍👦',
};

const ROUND_GRADIENTS: Record<number, string> = {
  1: 'from-purple-50 to-pink-50',
  2: 'from-blue-50 to-cyan-50',
  3: 'from-yellow-50 to-orange-50',
  4: 'from-red-50 to-pink-50',
  5: 'from-green-50 to-blue-50',
};

const ROUND_HOVER_COLORS: Record<number, string> = {
  1: 'hover:border-purple-500 group-hover:text-purple-600',
  2: 'hover:border-blue-500 group-hover:text-blue-600',
  3: 'hover:border-yellow-500 group-hover:text-yellow-600',
  4: 'hover:border-red-500 group-hover:text-red-600',
  5: 'hover:border-green-500 group-hover:text-green-600',
};

export function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    // Set page title
    document.title = "Joe's Garageband Explorer";

    const tokens = getStoredTokens();
    setIsLoggedIn(!!tokens);

    if (tokens) {
      fetchUserProfile()
        .then(profile => setUserProfile(profile))
        .catch(err => console.error('Failed to fetch user profile:', err));
    }
  }, []);

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setUserProfile(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-12">
          <div className="text-center mb-6 md:mb-8">
            {isLoggedIn && userProfile && (
              <div className="flex justify-end items-center gap-3 mb-3 md:mb-4">
                <div className="flex items-center gap-2 bg-gray-50 rounded-full py-2 px-3 md:px-4">
                  {userProfile.images[0] && (
                    <img
                      src={userProfile.images[0].url}
                      alt={userProfile.display_name}
                      className="w-6 h-6 md:w-8 md:h-8 rounded-full"
                    />
                  )}
                  <span className="text-xs md:text-sm font-medium text-gray-700">
                    {userProfile.display_name}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 md:px-6 rounded-full transition-colors duration-200 text-xs md:text-sm"
                >
                  Logout
                </button>
              </div>
            )}
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3 md:mb-4">
              Joe's Garageband Explorer
            </h1>
            <p className="text-base md:text-xl text-gray-600">
              Tools to help you find the perfect song for each Music League round
            </p>
          </div>

          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-6 md:mb-8">Rounds</h2>

            {[...ROUNDS].reverse().map((round) => {
              const emoji = ROUND_EMOJIS[round.number] || '🎵';
              const gradient = ROUND_GRADIENTS[round.number] || 'from-gray-50 to-gray-50';
              const hoverColor = ROUND_HOVER_COLORS[round.number] || 'hover:border-gray-500 group-hover:text-gray-600';

              if (!round.enabled) {
                return (
                  <div
                    key={round.number}
                    className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 md:p-6 opacity-50 cursor-not-allowed mb-4"
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="text-4xl md:text-5xl flex-shrink-0">{emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-block bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                            Round {round.number}
                          </span>
                        </div>
                        <h3 className="text-lg md:text-2xl font-bold text-gray-500">
                          {round.title}
                        </h3>
                        {round.subtitle && (
                          <p className="text-sm md:text-base text-gray-400 mt-1">
                            {round.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link key={round.number} to={round.path}>
                  <div className={`bg-gradient-to-r ${gradient} border-2 border-gray-200 ${hoverColor} rounded-xl p-4 md:p-6 transition-all hover:shadow-lg cursor-pointer group mb-4`}>
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="text-4xl md:text-5xl flex-shrink-0">{emoji}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-block bg-white text-gray-700 text-xs font-bold px-2 py-1 rounded shadow-sm">
                            Round {round.number}
                          </span>
                        </div>
                        <h3 className={`text-lg md:text-2xl font-bold text-gray-900 transition-colors ${hoverColor.split(' ')[1]}`}>
                          {round.title}
                        </h3>
                        {round.subtitle && (
                          <p className="text-sm md:text-base text-gray-600 mt-1">
                            {round.subtitle}
                          </p>
                        )}
                        {!round.subtitle && round.description && (
                          <p className="text-sm md:text-base text-gray-600 mt-1">
                            {round.description}
                          </p>
                        )}
                      </div>
                      <div className={`text-xl md:text-2xl text-gray-400 transition-colors flex-shrink-0 ${hoverColor.split(' ')[1]}`}>
                        →
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-gray-200 text-center">
            <p className="text-xs md:text-sm text-gray-500">
              Powered by Spotify Web API • Data cached locally
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-12">
          <div className="text-center mb-6 md:mb-8">
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3 md:mb-4">
              🎵 Music League Helper
            </h1>
            <p className="text-base md:text-xl text-gray-600">
              Tools to help you find the perfect song for each Music League season
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 md:mb-6">Available Seasons</h2>

            {/* Season 1: Parents' Birth Year */}
            <Link to="/parents-birth-year">
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-gray-200 hover:border-green-500 rounded-xl p-4 md:p-6 transition-all hover:shadow-lg cursor-pointer group">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="text-4xl md:text-5xl flex-shrink-0">👨‍👩‍👦</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg md:text-2xl font-bold text-gray-900 group-hover:text-green-600 transition-colors">
                      Parents' Birth Year
                    </h3>
                    <p className="text-sm md:text-base text-gray-600 mt-1">
                      Find songs from your mom and dad's birth years in your Spotify library
                    </p>
                  </div>
                  <div className="text-xl md:text-2xl text-gray-400 group-hover:text-green-500 transition-colors flex-shrink-0">
                    →
                  </div>
                </div>
              </div>
            </Link>

            {/* Future seasons placeholder */}
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-4 md:p-6 opacity-50">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="text-4xl md:text-5xl flex-shrink-0">🔜</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg md:text-2xl font-bold text-gray-500">More Seasons Coming Soon</h3>
                  <p className="text-sm md:text-base text-gray-500 mt-1">
                    New tools will be added for future Music League themes
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 md:mt-8 pt-6 md:pt-8 border-t border-gray-200 text-center">
            <p className="text-xs md:text-sm text-gray-500">
              Powered by Spotify Web API • No data stored on servers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

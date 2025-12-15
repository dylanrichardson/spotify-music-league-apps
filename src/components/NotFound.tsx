import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
          <div className="text-8xl md:text-9xl mb-6">🎵</div>

          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4">
            404
          </h1>

          <h2 className="text-xl md:text-2xl font-semibold text-gray-700 mb-4">
            Page Not Found
          </h2>

          <p className="text-base md:text-lg text-gray-600 mb-8">
            Looks like this track doesn't exist in our playlist.
          </p>

          <Link to="/">
            <button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-3 px-8 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl">
              Back to Home
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

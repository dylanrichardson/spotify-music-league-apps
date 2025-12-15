import { Link } from 'react-router-dom';
import { redirectToSpotifyAuth } from '../spotify-auth';

export function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-white font-semibold mb-4 md:mb-6 hover:underline text-sm md:text-base"
        >
          ← Back to Home
        </Link>
        <div className="bg-white rounded-lg shadow-2xl p-6 md:p-8">
          <div className="text-center">
            <h1 className="text-2xl md:text-4xl font-bold text-gray-800 mb-3 md:mb-4">
              Parents' Birth Year Finder
            </h1>
            <p className="text-sm md:text-base text-gray-600 mb-6 md:mb-8">
              Find songs from your mom and dad's birth years
            </p>
            <button
              onClick={redirectToSpotifyAuth}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 md:px-8 rounded-full transition-colors duration-200 shadow-lg hover:shadow-xl text-sm md:text-base"
            >
              Connect with Spotify
            </button>
            <p className="text-xs md:text-sm text-gray-500 mt-3 md:mt-4">
              You'll be redirected to Spotify to authorize this app
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

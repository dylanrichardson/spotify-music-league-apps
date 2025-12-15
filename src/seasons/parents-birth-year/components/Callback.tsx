import { useEffect, useState } from 'react';
import { exchangeCodeForToken } from '../spotify-auth';

export function Callback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const error = params.get('error');

      if (error) {
        setError(`Authorization failed: ${error}`);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        return;
      }

      try {
        await exchangeCodeForToken(code);
        // Redirect to the dashboard
        window.location.href = '/spotify-music-league-apps/parents-birth-year';
      } catch (err) {
        setError(`Failed to complete authorization: ${err}`);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
        {error ? (
          <>
            <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
            <p className="text-gray-700">{error}</p>
            <button
              onClick={() => (window.location.href = '/spotify-music-league-apps/parents-birth-year')}
              className="mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-full"
            >
              Go Back
            </button>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-gray-800">
              Completing authorization...
            </h2>
          </>
        )}
      </div>
    </div>
  );
}

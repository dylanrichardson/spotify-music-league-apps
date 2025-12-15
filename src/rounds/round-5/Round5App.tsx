import { useEffect, useState } from 'react';
import { Login } from './components/Login';
import { Callback } from './components/Callback';
import { Dashboard } from './components/Dashboard';
import { getStoredTokens } from '../../shared/spotify-auth';

export function Round5App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set page title
    document.title = "Parents' Birth Year - Music League Helper";

    const tokens = getStoredTokens();
    setIsAuthenticated(!!tokens);
    setIsLoading(false);
  }, []);

  // Handle OAuth callback - check for code or error query params
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('code') || searchParams.has('error')) {
    return <Callback />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-400 to-blue-500">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Login />;
}

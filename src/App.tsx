import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './components/Home';
import { Round1App } from './rounds/round-1/Round1App';
import { Round2App } from './rounds/round-2/Round2App';
import { Round5App } from './rounds/round-5/Round5App';

function App() {
  return (
    <BrowserRouter basename="/spotify-music-league-apps">
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Round routes */}
        <Route path="/round-1/*" element={<Round1App />} />
        <Route path="/round-2/*" element={<Round2App />} />
        <Route path="/round-5/*" element={<Round5App />} />

        {/* Legacy redirect - parents-birth-year redirects to round-5 */}
        <Route path="/parents-birth-year/*" element={<Navigate to="/round-5" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

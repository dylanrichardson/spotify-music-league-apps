import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './components/Home';
import { ParentsBirthYearApp } from './seasons/parents-birth-year/ParentsBirthYearApp';

function App() {
  return (
    <BrowserRouter basename="/spotify-music-league-apps">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/parents-birth-year/*" element={<ParentsBirthYearApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

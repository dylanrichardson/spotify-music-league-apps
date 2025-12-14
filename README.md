# Music League Helper Apps 🎵

A collection of web apps to help you find the perfect songs for Music League seasons. Built with React, TypeScript, and Tailwind CSS, powered by the Spotify Web API.

## What is Music League?

Music League is a game where players submit songs based on weekly themes, then vote on the best submissions. These tools help you search your Spotify library to find songs that match each week's theme.

## Available Seasons

### 🎭 Parents' Birth Year
Find songs from your mom and dad's birth years in your Spotify library or playlists.

**Features:**
- Search by both parents' birth years simultaneously
- Filter your entire library or specific playlists
- Searchable playlist selection
- Real-time results with progress tracking
- Sortable table view (by song, artist, album, or year)
- Grid view for browsing
- Smart caching (24hr for library, 1hr for playlists)
- Persistent login

**Path:** `/parents-birth-year`

## Project Structure

```
spotify-music-league-apps/
├── src/
│   ├── components/
│   │   └── Home.tsx                 # Landing page
│   ├── seasons/
│   │   └── parents-birth-year/      # Season 1
│   │       ├── components/
│   │       │   ├── Dashboard.tsx
│   │       │   ├── Login.tsx
│   │       │   └── Callback.tsx
│   │       ├── spotify-auth.ts
│   │       ├── spotify-api.ts
│   │       ├── types.ts
│   │       └── ParentsBirthYearApp.tsx
│   ├── App.tsx                      # Main router
│   └── main.tsx
├── public/
└── dist/                            # Build output
```

## Development

### Prerequisites
- Node.js (v18 or higher)
- A Spotify Developer App

### Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create app"
3. Fill in the details:
   - **App name**: Music League Helper (or any name)
   - **App description**: Helper tools for Music League
   - **Redirect URIs**:
     - Local dev: `http://127.0.0.1:8080/spotify-music-league-apps/parents-birth-year`
     - Production: `https://YOUR_USERNAME.github.io/spotify-music-league-apps/parents-birth-year`
   - **APIs used**: Web API
4. Click "Save"
5. Copy your **Client ID**
6. Update `src/seasons/parents-birth-year/spotify-auth.ts` with your Client ID

### Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open browser to
http://127.0.0.1:8080/
```

### Building for Production

```bash
# Build the project
npm run build

# Preview the build locally
npm run preview
```

## Deployment to GitHub Pages

This project is configured for GitHub Pages deployment:

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/spotify-music-league-apps.git
   git push -u origin main
   ```

2. **Deploy:**
   ```bash
   npm run deploy
   ```
   This builds the project and pushes to the `gh-pages` branch.

3. **Enable GitHub Pages:**
   - Go to your repo settings
   - Navigate to Pages
   - Source: Deploy from branch
   - Branch: `gh-pages` / `root`
   - Save

4. **Update Spotify Redirect URI:**
   - Add your GitHub Pages URL to Spotify app settings:
   - `https://YOUR_USERNAME.github.io/spotify-music-league-apps/parents-birth-year`

Your app will be live at: `https://YOUR_USERNAME.github.io/spotify-music-league-apps/`

## Adding New Seasons

To add a new Music League season:

1. Create a new folder in `src/seasons/` (e.g., `src/seasons/song-from-movie/`)
2. Copy the structure from `parents-birth-year/`
3. Update the season's components and logic
4. Add the route to `src/App.tsx`
5. Add a link on the home page (`src/components/Home.tsx`)

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS v3** for styling
- **React Router** for client-side routing
- **Spotify Web API** for music data
- **localStorage** for caching and session persistence

## How Caching Works

- **Library**: Cached for 24 hours (use `localStorage.removeItem('cached_library')` to clear)
- **Playlists**: Cached for 1 hour per playlist
- **Tokens**: Automatically refreshed when needed
- **First load**: Fetches all tracks from Spotify
- **Subsequent searches**: Instant results from cache

## Security Notes

- Uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure client-side authentication
- No backend required - all processing happens in your browser
- Only requests read permissions (no write access)
- All data stored locally in your browser (localStorage)
- Never commit your Client ID to a public repository if concerned about rate limits

## Troubleshooting

**"No authentication tokens found"**
- Click logout and log in again

**Stuck on loading**
- Check browser console for errors
- Verify Client ID is correct in `spotify-auth.ts`

**No songs found**
- Try different years
- Make sure your library has songs from those years
- Check that you selected the correct source (library vs playlist)

**Cache issues**
- Clear cache: `localStorage.removeItem('cached_library')`
- Refresh the page

**404 on refresh (GitHub Pages)**
- GitHub Pages is configured to handle client-side routing
- If issues persist, check that `404.html` was deployed

## Contributing

This is a personal project, but feel free to fork and adapt for your own Music League games!

## License

MIT

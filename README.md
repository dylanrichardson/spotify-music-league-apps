# Joe's Garageband Explorer 🎵

A collection of web apps to help you find the perfect songs for Music League rounds. Built with React, TypeScript, and Tailwind CSS, powered by the Spotify Web API.

## What is Music League?

Music League is a game where players submit songs based on weekly themes, then vote on the best submissions. These tools help you search your Spotify library to find songs that match each round's theme.

## Live App

🌐 **[https://dylanrichardson.github.io/spotify-music-league-apps/](https://dylanrichardson.github.io/spotify-music-league-apps/)**

## Available Rounds

### ⏱️ Round 1: Shorties
Find songs that are less than 2 minutes long.

**Features:**
- Configurable max duration (in seconds)
- Filter by library or playlists
- Real-time filtering with progress tracking
- Sort by duration, artist, song, or album
- List and grid views

**Path:** `/round-1`

### 💎 Round 2: Hidden Gems
Find songs from artists with under 100k monthly listeners.

**Features:**
- Configurable follower threshold
- Shows exact follower counts for each artist
- Fetches artist data from Spotify API
- Sort by followers, artist, song, or album
- Discover hidden talent in your library

**Path:** `/round-2`

### 👨‍👩‍👦 Round 5: Parents' Birth Year Finder
Find songs from your mom and dad's birth years.

**Features:**
- Search by both parents' birth years simultaneously
- Filter your entire library or specific playlists
- Searchable playlist selection
- Sort by year, artist, song, or album
- List and grid views

**Path:** `/round-5`

### 🎺 Round 3 & 🏎️ Round 4
Coming soon! (Disabled in UI)

## Shared Features Across All Rounds

- ✅ **Unified OAuth** - Single login works across all rounds
- ✅ **Smart Caching** - Library cached indefinitely, auto-syncs when needed
- ✅ **Web Playback SDK** - Play tracks directly in browser (Premium users)
- ✅ **Spotify Connect** - Fallback playback for free tier users
- ✅ **Responsive Design** - Works great on mobile and desktop
- ✅ **Progress Tracking** - Real-time progress bars for large libraries
- ✅ **Manual Resync** - Force refresh your library or playlists anytime

## Project Structure

```
spotify-music-league-apps/
├── src/
│   ├── components/
│   │   ├── Home.tsx              # Landing page with all rounds
│   │   ├── NotFound.tsx          # 404 page
│   │   └── AuthCallback.tsx      # Unified OAuth callback handler
│   ├── rounds/
│   │   ├── config.ts             # Round definitions
│   │   ├── types.ts              # Shared TypeScript types
│   │   ├── round-1/              # Shorties round
│   │   ├── round-2/              # Hidden gems round
│   │   └── round-5/              # Parents' birth year round
│   ├── shared/
│   │   ├── spotify-auth.ts       # OAuth authentication
│   │   ├── spotify-api.ts        # Spotify API client
│   │   ├── player.ts             # Playback manager
│   │   └── caching.ts            # Cache utilities
│   ├── App.tsx                   # Main router
│   └── main.tsx
├── public/
│   ├── 404.html                  # GitHub Pages SPA routing
│   └── favicon.svg
└── dist/                         # Build output (deployed to gh-pages)
```

## Development

### Prerequisites
- Node.js (v18 or higher)
- A Spotify Developer App

### Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create app"
3. Fill in the details:
   - **App name**: Joe's Garageband Explorer (or any name)
   - **App description**: Helper tools for Music League
   - **Redirect URIs** (uses unified callback):
     - Local dev: `http://127.0.0.1:8080/spotify-music-league-apps/callback`
     - Production: `https://dylanrichardson.github.io/spotify-music-league-apps/callback`
   - **APIs used**: Web API
4. Click "Save"
5. Copy your **Client ID**
6. Update `src/shared/spotify-auth.ts` with your Client ID (line 3)

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
   - `https://dylanrichardson.github.io/spotify-music-league-apps/callback`

Your app will be live at: `https://dylanrichardson.github.io/spotify-music-league-apps/`

## Adding New Rounds

To add a new Music League round:

1. **Update Round Config** (`src/rounds/config.ts`):
   ```typescript
   {
     number: 6,
     title: 'Your New Round',
     subtitle: 'Description here',
     path: '/round-6',
     enabled: true,
     description: 'Longer description',
   }
   ```

2. **Create Round Directory**: Copy structure from an existing round:
   ```bash
   cp -r src/rounds/round-1 src/rounds/round-6
   ```

3. **Update Components**:
   - Modify `Dashboard.tsx` with your filtering logic
   - Update `Login.tsx` with round-specific title
   - Update `Round6App.tsx` naming

4. **Add Route** to `src/App.tsx`:
   ```typescript
   <Route path="/round-6/*" element={<Round6App />} />
   ```

5. **Add Emoji** to `src/components/Home.tsx` ROUND_EMOJIS

6. **No Spotify Config Change Needed** - unified OAuth handles all rounds!

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS v3** for styling
- **React Router** for client-side routing
- **Spotify Web API** for music data
- **localStorage** for caching and session persistence

## How Caching Works

The app uses a **versioned caching system** (current version: 2):

- **Library**: Cached indefinitely until manual resync or version bump
- **Playlists**: Auto-syncs after 24 hours
- **Tokens**: Automatically refreshed when expired
- **First load**: Fetches all tracks from Spotify with progress tracking
- **Subsequent searches**: Instant results from cache
- **Version Bumps**: Automatically invalidate old caches when structure changes

### Cache Structure
```typescript
{
  version: 2,           // Cache version
  tracks: [...],        // Minimal track data with artist IDs
  timestamp: Date.now(),
  lastSynced: Date.now()
}
```

### Manual Cache Clear
```javascript
// Clear library cache
localStorage.removeItem('cached_library');

// Clear playlists cache
localStorage.removeItem('cached_playlists');

// Clear specific playlist
localStorage.removeItem('cached_playlist_PLAYLIST_ID');
```

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

## Architecture Highlights

### Unified OAuth System
- Single `/callback` route handles authentication for all rounds
- Stores intended return path in localStorage
- No need to update Spotify config when adding new rounds

### Cache Versioning
- `CACHE_VERSION` constant in `spotify-api.ts`
- Automatically invalidates old caches on version mismatch
- Increment when making breaking changes to cache structure

### Shared Modules Pattern
- `/src/shared/` contains reusable auth, API, and player logic
- `/src/rounds/` contains round-specific implementations
- DRY principle applied throughout

## Contributing

This is a personal project, but feel free to fork and adapt for your own Music League games!

## License

MIT

---

**For detailed development documentation, see [CLAUDE.md](./CLAUDE.md)**

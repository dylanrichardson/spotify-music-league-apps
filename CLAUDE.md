# Claude Development Documentation

This document contains context and patterns for AI assistants working on this codebase.

## Project Overview

**Joe's Garageband Explorer** is a multi-round web application for Music League players to find songs in their Spotify library that match specific criteria. Built as a SPA with React + TypeScript + Vite, deployed to GitHub Pages.

**Key Philosophy**: Each round is a self-contained mini-app with shared authentication, caching, and player infrastructure.

## Quick Deploy Commands

```bash
# Full deployment (build + deploy)
npm run deploy

# Just build (for testing)
npm run build

# Local development
npm run dev
# Access at: http://127.0.0.1:8080/spotify-music-league-apps/
```

## Architecture Decisions

### Unified OAuth Callback System

**Why**: Originally each round had its own callback handler at `/round-X`. This required updating Spotify Developer Dashboard every time we added a round.

**Solution**: Single `/callback` route (`src/components/AuthCallback.tsx`) handles all OAuth redirects.

**Flow**:
1. User clicks "Connect with Spotify" on any round
2. `redirectToSpotifyAuth(roundPath)` stores intended destination in `localStorage.auth_return_path`
3. User authorizes on Spotify
4. Spotify redirects to `/callback` with auth code
5. `AuthCallback` exchanges code for tokens
6. Navigates user back to original round using stored path

**Spotify Config**: Only needs ONE redirect URI: `.../callback`

### Cache Versioning System

**Location**: `src/shared/spotify-api.ts:5`

**Current Version**: `2`

**Why**: When we make breaking changes to cache structure (e.g., adding `artistIds` field), old cached data becomes incompatible. Without versioning, users would get errors or broken functionality.

**How it works**:
1. All cached data includes `version: CACHE_VERSION`
2. On read, check if `cachedData.version !== CACHE_VERSION`
3. If mismatch, automatically remove old cache and refetch
4. All "last sync" functions (`getLibraryLastSync`, etc.) also check version

**When to bump**:
- Adding/removing fields from `CachedTrack` interface
- Changing how data is serialized/deserialized
- Renaming cache keys

**How to bump**:
```typescript
// src/shared/spotify-api.ts
const CACHE_VERSION = 3; // Increment this
```

That's it! No manual cache clearing needed for users.

### Shared Modules Pattern

```
src/
├── shared/          # Reusable across all rounds
│   ├── spotify-auth.ts    # OAuth flow
│   ├── spotify-api.ts     # API client + caching
│   ├── player.ts          # Playback manager
│   └── caching.ts         # localStorage helpers
├── rounds/          # Round-specific code
│   ├── config.ts          # Central round definitions
│   ├── types.ts           # Shared TypeScript types
│   └── round-X/           # Each round is self-contained
└── components/      # Top-level components
    ├── Home.tsx           # Landing page
    ├── AuthCallback.tsx   # Unified OAuth handler
    └── NotFound.tsx       # 404 page
```

**DRY Principle**: If multiple rounds need it, put it in `/shared/`. If it's round-specific, keep it in `/rounds/round-X/`.

## Adding a New Round

### Step-by-Step

1. **Define in config** (`src/rounds/config.ts`):
```typescript
{
  number: 6,
  title: 'Songs from Movies',
  subtitle: 'Find that perfect soundtrack',
  path: '/round-6',
  enabled: true,
  description: 'Search for songs featured in movies',
}
```

2. **Copy existing round structure**:
```bash
cp -r src/rounds/round-1 src/rounds/round-6
```

3. **Rename files**:
- `Round1App.tsx` → `Round6App.tsx`
- Update all imports and exports

4. **Implement filtering logic** in `Dashboard.tsx`:
```typescript
const handleFilter = async () => {
  // Your custom filtering logic here
  const filtered = allTracks.filter(track => {
    // e.g., check if track is from a movie soundtrack
    return someMovieCheckLogic(track);
  });

  setFilteredTracks(filtered);
};
```

5. **Update routing** (`src/App.tsx`):
```typescript
import { Round6App } from './rounds/round-6/Round6App';
// ...
<Route path="/round-6/*" element={<Round6App />} />
```

6. **Add emoji** (`src/components/Home.tsx`):
```typescript
const ROUND_EMOJIS: Record<number, string> = {
  // ...
  6: '🎬',
};
```

7. **No Spotify config change needed!** The unified OAuth system handles it.

## Important Code Patterns

### Round Dashboard Structure

Each round's `Dashboard.tsx` follows this pattern:

```typescript
export function Dashboard() {
  // 1. State management
  const [filteredTracks, setFilteredTracks] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('library');

  // 2. Fetch tracks (from cache or Spotify)
  const handleFilter = async () => {
    const allTracks = selectedPlaylist === 'library'
      ? await fetchLibraryTracks(onProgress)
      : await fetchPlaylistTracks(selectedPlaylist, onProgress);

    // 3. Apply round-specific filtering
    const filtered = allTracks.filter(/* your logic */);

    setFilteredTracks(filtered);
  };

  // 4. UI: Filters, results table, playback controls
  return (/* JSX */);
}
```

### Caching Best Practices

**DO**:
- Use `fetchLibraryTracks()` - automatically handles caching
- Use `fetchUserPlaylists()` - auto-syncs every 24hrs
- Use `fetchPlaylistTracks(id)` - caches per-playlist

**DON'T**:
- Call Spotify API directly
- Implement your own caching
- Store full track objects in cache (use minimal `CachedTrack` type)

**Manual Resync**:
```typescript
// Library
const { added, removed, tracks } = await resyncLibrary(onProgress);

// Playlists
const freshPlaylists = await resyncPlaylists();
```

### TypeScript Types

**Core types** (`src/rounds/types.ts`):
```typescript
SpotifyTrack       // Full track with nested artist/album
CachedTrack        // Minimal track for localStorage
SpotifyPlaylist    // Playlist metadata
UserProfile        // User info (name, photos)
AuthTokens         // OAuth tokens
RoundConfig        // Round definition
```

**When adding fields to `CachedTrack`**:
1. Update interface in `types.ts`
2. Update `toMinimalTrack()` in `spotify-api.ts`
3. Update `fromMinimalTrack()` in `spotify-api.ts`
4. **Bump `CACHE_VERSION`**

## Deployment Process

### Standard Deployment

```bash
npm run deploy
```

This runs:
1. `npm run build` - TypeScript compile + Vite build
2. `gh-pages -d dist` - Pushes `dist/` to `gh-pages` branch

### GitHub Pages Configuration

**Settings → Pages**:
- Source: Deploy from a branch
- Branch: `gh-pages` / root
- URL: `https://dylanrichardson.github.io/spotify-music-league-apps/`

### SPA Routing on GitHub Pages

**Problem**: Direct navigation to `/round-1` returns 404 from GitHub

**Solution**: `public/404.html` contains redirect script that:
1. Captures the intended path from 404 URL
2. Redirects to `/` with path encoded in query string
3. `index.html` has matching script to restore URL
4. React Router takes over

**Reference**: [spa-github-pages](https://github.com/rafgraph/spa-github-pages)

## Spotify Configuration

### Developer Dashboard Setup

**App Settings**:
- **Name**: Joe's Garageband Explorer
- **Client ID**: `337781715d4842f98d85fe828cb0d56f` (in `spotify-auth.ts:3`)
- **Redirect URIs**:
  - Local: `http://127.0.0.1:8080/spotify-music-league-apps/callback`
  - Production: `https://dylanrichardson.github.io/spotify-music-league-apps/callback`
- **APIs**: Web API only (no Server API needed)

**Scopes Requested** (`spotify-auth.ts:4-13`):
- `user-library-read` - Read saved tracks
- `playlist-read-*` - Read playlists
- `user-read-*` - User profile and playback state
- `user-modify-playback-state` + `streaming` - Web Playback SDK

### OAuth Flow Details

**PKCE (Proof Key for Code Exchange)**:
1. Generate random `code_verifier`
2. Hash it to create `code_challenge`
3. Send `code_challenge` to Spotify
4. Spotify redirects with `code`
5. Exchange `code` + `code_verifier` for tokens

**Why PKCE**: Secure for client-side apps (no client secret needed)

**Token Storage**:
```typescript
localStorage.spotify_tokens = {
  access_token: string,
  refresh_token: string,
  expires_at: timestamp,
}
```

**Auto-refresh**: `getAccessToken()` checks expiry and refreshes if needed

## Common Issues & Solutions

### "No artist ID found for track"

**Cause**: Old cache without `artistIds` field (pre-v2)

**Solution**: Cache version mismatch automatically clears it. If persists:
```javascript
localStorage.removeItem('cached_library');
```

### OAuth redirect fails

**Check**:
1. Spotify redirect URI matches exactly (including trailing slash)
2. Client ID is correct in `spotify-auth.ts`
3. Browser console for errors
4. Check `localStorage.code_verifier` exists during flow

### Tracks not filtering correctly

**Check**:
1. Are you using cached data? (check `progress.total` count)
2. Filter logic correct? (log `allTracks` before filtering)
3. Artist IDs available? (for Round 2 only)

### "Last synced: Never" doesn't clear after filtering

**Cause**: `getLibraryLastSync()` doesn't check cache version

**Solution**: Should be fixed now (v2), but verify version check exists:
```typescript
if (cachedData.version !== CACHE_VERSION) return null;
```

## Performance Considerations

### Large Libraries

**Problem**: Users with 10k+ tracks take time to fetch initially

**Solutions Applied**:
- Progress callbacks show real-time count
- Pagination (50 tracks per API call)
- Incremental filtering (show matches as they arrive)
- Aggressive caching (never refetch unless user requests)

**Round 2 Specific**: Fetching artist data for every track is slow
- Cache artist follower counts in `Map` during filtering
- Only fetch each artist once even if they have multiple tracks

### localStorage Quota

**Limit**: ~5-10MB depending on browser

**Mitigation**:
- Store minimal track data (`CachedTrack` is ~200 bytes vs ~2KB for full)
- Only cache track ID, name, artist names/IDs, album, image, URI
- Catch quota errors: `try/catch` on `localStorage.setItem()`

## Code Style & Conventions

### Naming
- Components: PascalCase (`Dashboard.tsx`)
- Files: kebab-case for utilities (`spotify-auth.ts`)
- Types: PascalCase (`SpotifyTrack`)
- Functions: camelCase (`fetchLibraryTracks`)

### State Management
- Use React hooks (no Redux/Zustand)
- Keep state local to each round
- Shared state through URL params (e.g., selected playlist)

### Error Handling
- Show user-friendly messages in UI
- Log technical details to console
- Don't crash on single track failures (Round 2)

### Mobile-First
- All text should wrap (`break-words` not `truncate`)
- Test on small screens (375px width)
- Use `md:` breakpoint for desktop enhancements

## Testing Checklist

Before deploying:

- [ ] Test OAuth flow on all 3 rounds
- [ ] Test filtering with library and playlists
- [ ] Test sorting (all columns)
- [ ] Test playback (Premium and free tier)
- [ ] Test on mobile browser
- [ ] Test direct navigation to `/round-X`
- [ ] Test 404 page
- [ ] Clear cache and re-test first load
- [ ] Check console for errors

## Future Improvements

### Potential Features
- [ ] Export filtered results to CSV
- [ ] Share filtered playlists directly to Spotify
- [ ] Save filter presets per round
- [ ] Add more rounds (horns, driving songs)
- [ ] Dark mode
- [ ] Audio preview without SDK (use Spotify preview_url)

### Technical Debt
- Consider migrating to Vite's environment variables for Client ID
- Add proper error boundaries
- Add loading skeleton states
- Consider IndexedDB for larger caches
- Add E2E tests (Playwright?)

## Contact

**Original Developer**: Dylan Richardson (dylan.richardson@toasttab.com)

**Deployed**: December 2024

---

**This document is maintained by AI assistants (Claude) working on the codebase. Update it when making architectural changes!**

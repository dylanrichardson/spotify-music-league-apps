import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'redirect-to-base',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Redirect /spotify-music-league-apps to /spotify-music-league-apps/
          if (req.url === '/spotify-music-league-apps') {
            res.writeHead(301, { Location: '/spotify-music-league-apps/' });
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  base: '/spotify-music-league-apps/',
  server: {
    host: '127.0.0.1',
    port: 8080,
  },
  build: {
    outDir: 'dist',
  },
  appType: 'spa',
})

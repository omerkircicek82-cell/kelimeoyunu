import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.ARENA_VITE_API ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          dictionary: ['@arena/game-engine/offline-words'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/sfx': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/documents': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept?.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/chat': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/status': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ingest': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});

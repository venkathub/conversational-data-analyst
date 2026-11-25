import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api is proxied to the Express server so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});

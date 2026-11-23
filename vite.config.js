import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Платформенный превью-прокси ходит со своим Host — разрешаем все.
    allowedHosts: true,
  },
  preview: {
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

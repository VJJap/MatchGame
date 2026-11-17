import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // expose on LAN so phones / iPads on the same Wi-Fi can join
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true, changeOrigin: true },
      '/api': { target: SERVER, changeOrigin: true },
    },
  },
});

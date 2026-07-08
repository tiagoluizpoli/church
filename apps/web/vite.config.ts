import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  envDir: '../../',
  plugins: [
    tailwindcss(),
    tanstackRouter({}),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'base-fullstack-template',
        // biome-ignore lint/style/useNamingConvention: PWA manifest spec requires snake_case
        short_name: 'base-fullstack-template',
        description: 'base-fullstack-template - PWA Application',
        // biome-ignore lint/style/useNamingConvention: PWA manifest spec requires snake_case
        theme_color: '#0c0c0c',
      },
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4001,
  },
});

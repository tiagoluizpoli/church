import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devAllowedHosts } from '../../tooling/worktree/dev-hostname';

// Values come from Varlock (`dev` runs through it), never from a value file
// Vite finds itself: envDir stays this package, which holds none (ADR-0005).
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({ routeFileIgnorePattern: '\\.test\\.' }),
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
    // The worktree's CHURCH_WEB_PORT, mapped by .env.schema; Playwright's
    // webServer overrides PORT so e2e can run on its own ports alongside a
    // normal `bun run dev` — see apps/web/playwright.config.ts.
    port: Number(process.env.PORT) || 4001,
    // `--host` listens on every interface; beyond localhost and IP
    // literals, remote clients are accepted only on the private worktree
    // hostnames (ADR-0005), e.g. church-<worktree>.<CHURCH_DEV_DOMAIN>. This
    // machine's domain reaches Vite through Varlock from the root .env.local.
    allowedHosts: devAllowedHosts({ domain: process.env.CHURCH_DEV_DOMAIN }),
  },
});

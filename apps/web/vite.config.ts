import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devAllowedHosts } from '../../tooling/worktree/dev-hostname.ts';

// Values come from Varlock (`dev` runs through it), never from a value file
// Vite finds itself: envDir stays this package, which holds none (ADR-0005).
export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      routeFileIgnorePattern: '\\.test\\.',
      autoCodeSplitting: true,
    }),
    react(),
    {
      // The entry stylesheet must not hold index.html's boot shell off the
      // screen: it loads as print (applied on load; main.tsx waits for it),
      // and a preload keeps it at the top of the network queue.
      name: 'non-blocking-entry-css',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html) =>
          html.replace(
            /<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g,
            `<link rel="preload" as="style" crossorigin href="$1"><link rel="stylesheet" crossorigin href="$1" media="print" onload="this.media='all'">`,
          ),
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'base-fullstack-template',
        // biome-ignore lint/style/useNamingConvention: PWA manifest spec requires snake_case
        short_name: 'base-fullstack-template',
        description: 'base-fullstack-template - PWA Application',
        // biome-ignore lint/style/useNamingConvention: PWA manifest spec requires snake_case
        theme_color: '#0c0c0c',
        // biome-ignore lint/style/useNamingConvention: PWA manifest spec requires snake_case
        start_url: '/app',
        scope: '/',
      },
      // Deferred: a plain script in the head holds the parser, and so the first paint.
      injectRegister: 'script-defer',
      pwaAssets: { disabled: false, config: true },
      devOptions: { enabled: true },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  // Keep the lazy availability route from triggering a reload of active pages.
  optimizeDeps: { include: ['@base-ui/react/switch'] },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
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
    // Transformed at start, so the first sign-in load after a restart is not
    // also the one that transforms its whole module graph.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/routes/__root.tsx',
        './src/routes/login.tsx',
      ],
    },
  },
});

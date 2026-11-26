import { readFileSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from '@church/app-config';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { firstPaint } from '../../tooling/vite/first-paint.ts';
import { nonBlockingEntryStylesheet } from '../../tooling/vite/non-blocking-entry-stylesheet.ts';
import { devAllowedHosts } from '../../tooling/worktree/dev-hostname.ts';

const I18N_DIR = path.resolve(import.meta.dirname, '../../packages/i18n');
const inlangSettings = JSON.parse(
  readFileSync(path.resolve(I18N_DIR, 'project.inlang/settings.json'), 'utf8'),
) as { locales: string[] };

// Values come from Varlock (`dev` runs through it), never from a value file
// Vite finds itself: envDir stays this package, which holds none (ADR-0005).
export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      routeFileIgnorePattern: '\\.test\\.',
      autoCodeSplitting: true,
    }),
    react(),
    firstPaint({
      cssFile: path.resolve(import.meta.dirname, './src/first-paint.css'),
      locale: {
        locales: inlangSettings.locales,
        defaultLocale: appConfig.defaultLocale,
        cookieName: appConfig.localeCookieName,
        queryParam: appConfig.localeQueryParam,
        messagesFile: (locale) =>
          path.resolve(I18N_DIR, `messages/${locale}.json`),
      },
    }),
    nonBlockingEntryStylesheet(),
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
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      // The build splits each route's copy into per-message modules; dev and
      // tests keep the three locale modules (packages/i18n compiles both).
      ...(command === 'build'
        ? [
            {
              find: /^@church\/i18n\/(messages|runtime)$/,
              replacement: path.resolve(
                I18N_DIR,
                'src/paraglide-message-modules/$1.js',
              ),
            },
          ]
        : []),
    ],
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
}));

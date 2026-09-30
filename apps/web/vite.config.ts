import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { devAllowedHosts } from '../../tooling/worktree/dev-hostname';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // This machine's domain, copied into the root `.env.local` by env:local.
  const { CHURCH_DEV_DOMAIN: devDomain } = loadEnv(
    mode,
    path.resolve(__dirname, '../..'),
    'CHURCH_DEV_',
  );

  return {
    envDir: '../../',
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
      // Playwright's webServer overrides PORT so e2e can run on its own ports
      // alongside a normal `bun run dev` — see apps/web/playwright.config.ts.
      port: Number(env.PORT) || 4001,
      // `--host` listens on every interface; beyond localhost and IP
      // literals, remote clients are accepted only on the private worktree
      // hostnames (ADR-0005), e.g. church-<worktree>.<CHURCH_DEV_DOMAIN>.
      allowedHosts: devAllowedHosts({ domain: devDomain }),
    },
  };
});

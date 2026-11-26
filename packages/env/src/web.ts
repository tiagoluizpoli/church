import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

interface ViteImportMeta {
  env: Record<string, string | undefined>;
}

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    // An absolute API origin (local/worktree development, tests) or `/`: the
    // deployed image calls the API on its own origin, whatever its hostname.
    VITE_SERVER_URL: z.union([z.url(), z.literal('/')]),
    // The source revision baked in at build; error reports carry it so they
    // resolve against that build's source maps.
    // Per environment. The browser key is referrer-restricted and drives the
    // address search and pin map; the Embed key is separate and serves the
    // public page's map. Unset, the Google search and map are not offered.
    VITE_GOOGLE_MAPS_BROWSER_KEY: z.string().min(1).optional(),
    VITE_GOOGLE_MAPS_EMBED_KEY: z.string().min(1).optional(),
    // The Map ID the pin map's Advanced Markers need; development falls back
    // to Google's demo id when unset.
    VITE_GOOGLE_MAPS_MAP_ID: z.string().min(1).optional(),
    VITE_APP_REVISION: z.string().min(1).default('unversioned'),
  },
  runtimeEnv: (import.meta as unknown as ViteImportMeta).env,
  emptyStringAsUndefined: true,
});

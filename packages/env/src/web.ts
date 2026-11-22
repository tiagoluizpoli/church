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
    // The browser-restricted Google Maps Embed key of the Public Church Profile
    // map; unset, the page shows the address and links without a map.
    VITE_MAPS_EMBED_API_KEY: z.string().min(1).optional(),
    VITE_APP_REVISION: z.string().min(1).default('unversioned'),
  },
  runtimeEnv: (import.meta as unknown as ViteImportMeta).env,
  emptyStringAsUndefined: true,
});

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
  },
  runtimeEnv: (import.meta as unknown as ViteImportMeta).env,
  emptyStringAsUndefined: true,
});

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

interface ViteImportMeta {
  env: Record<string, string | undefined>;
}

export const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_SERVER_URL: z.url(),
  },
  runtimeEnv: (import.meta as unknown as ViteImportMeta).env,
  emptyStringAsUndefined: true,
});

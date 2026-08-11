import 'dotenv/config';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z.coerce.number().min(1).default(3000),
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    UNLEASH_API_URL: z.url(),
    UNLEASH_API_TOKEN: z.string(),
    ASSIGNMENT_CANCEL_LEAD_TIME_DAYS: z.coerce.number().int().min(0).default(3),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().default('Church <onboarding@resend.dev>'),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
    OUTBOX_DRAIN_BATCH_SIZE: z.coerce.number().int().min(1).default(10),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    /** Non-production only, regardless of this flag — gates every debug-only
     * HTTP route (e.g. redemption's verification-code readback for E2E), so
     * a future public non-production environment (staging, ...) stays shut
     * by default instead of inheriting every debug route via NODE_ENV alone. */
    ENABLE_DEBUG_ENDPOINTS: z.stringbool().default(false),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

import { z } from 'zod';

/** The 503 a transient outage answers, the auth backend's included; the client retries, never signs out. */
export const serviceUnavailableResponseSchema = z.object({
  error: z.literal('SERVICE_UNAVAILABLE'),
  message: z.string(),
});

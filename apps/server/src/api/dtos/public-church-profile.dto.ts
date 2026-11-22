import { z } from 'zod';
import { recurrenceSchema } from './event-template.dto';

export const publicChurchProfileParamsSchema = z.object({
  slug: z.string().min(1).max(63),
});

/**
 * The explicit allow-list a signed-out visitor may see; never the admin
 * Church Settings DTO. `slug` is the current one, so an old slug's caller can
 * replace its URL.
 */
export const publicChurchProfileResponseSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  programme: z.array(
    z.strictObject({
      recurrence: recurrenceSchema,
      startTime: z.string(),
      label: z.string(),
      place: z.string().nullable(),
    }),
  ),
});

export const publicChurchProfileErrorResponseSchema = z.object({
  error: z.enum(['NOT_FOUND', 'RATE_LIMITED']),
  message: z.string(),
});

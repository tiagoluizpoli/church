import { z } from 'zod';
import { recurrenceSchema } from './event-template.dto';

const mainAddressAreaSchema = z.strictObject({
  bairro: z.string(),
  city: z.string(),
  uf: z.string(),
});

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
  addresses: z.array(
    z.strictObject({
      label: z.string().nullable(),
      street: z.string(),
      number: z.string(),
      complement: z.string().nullable(),
      bairro: z.string(),
      city: z.string(),
      uf: z.string(),
      cep: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      placeId: z.string().nullable(),
      isMain: z.boolean(),
    }),
  ),
  /** Shown for context and the shared-link description even when the Main Address is private. */
  mainAddressArea: mainAddressAreaSchema.nullable(),
});

export const publicChurchProfileErrorResponseSchema = z.object({
  error: z.enum(['NOT_FOUND', 'RATE_LIMITED']),
  message: z.string(),
});

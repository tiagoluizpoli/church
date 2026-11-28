import { z } from 'zod';

/** The `{ error, message }` body every refusal sends (`refuse` and the global error handler). */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** What the Active Church hook refuses with: no session (401), no Church Membership (403). */
export const authErrorResponses = {
  401: errorResponseSchema,
  403: errorResponseSchema,
};

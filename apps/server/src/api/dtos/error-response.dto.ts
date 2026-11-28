import { z } from 'zod';
import { serviceUnavailableResponseSchema } from './service-unavailable.dto';

/** The `{ error, message }` body every refusal sends (`refuse` and the global error handler). */
export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

/** What a session lookup refuses with: no session (401), auth backend down (503). */
export const sessionErrorResponses = {
  401: errorResponseSchema,
  503: serviceUnavailableResponseSchema,
};

/** What the Active Church hook refuses with: the session refusals, or no Church Membership (403). */
export const authErrorResponses = {
  ...sessionErrorResponses,
  403: errorResponseSchema,
};

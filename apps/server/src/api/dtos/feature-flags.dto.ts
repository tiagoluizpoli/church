import { z } from 'zod';

export const featureFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});
export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;

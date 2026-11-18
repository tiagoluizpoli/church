import { z } from 'zod';

/**
 * What `db:init` reads (its `seed-data.json`) to initialize a system: the
 * first Church and the email of its first ChurchAdmin.
 */
export const SystemInitializationInputSchema = z.object({
  churchName: z.string().min(1),
  churchSlug: z.string().min(1),
  adminEmail: z.email(),
});

export type SystemInitializationInput = z.infer<
  typeof SystemInitializationInputSchema
>;

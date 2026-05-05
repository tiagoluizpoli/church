import { z } from 'zod';

export const SeedDataSchema = z.object({
  churchName: z.string().min(1),
  churchSlug: z.string().min(1),
  adminEmail: z.email(),
});

export type SeedData = z.infer<typeof SeedDataSchema>;

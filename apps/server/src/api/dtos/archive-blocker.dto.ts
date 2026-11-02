import { z } from 'zod';

const blockerBaseSchema = z.object({
  ministryId: z.string(),
  ministryName: z.string(),
});

/** A location that still uses an item being archived; links derive from its IDs. */
export const archiveBlockerSchema = z.discriminatedUnion('kind', [
  blockerBaseSchema.extend({
    kind: z.literal('cycle'),
    cycleId: z.string(),
    cycleName: z.string(),
  }),
  blockerBaseSchema.extend({
    kind: z.literal('requirement'),
    cycleId: z.string(),
    cycleName: z.string(),
    eventId: z.string(),
    eventTimeBlockId: z.string(),
  }),
  blockerBaseSchema.extend({
    kind: z.literal('usual_setup'),
    templateTimeBlockId: z.string(),
  }),
]);

export const archiveBlockedResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  blockers: z.array(archiveBlockerSchema),
});

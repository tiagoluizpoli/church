import { z } from 'zod';

const blockerMinistry = {
  ministryId: z.string(),
  ministryName: z.string(),
};

export const archiveBlockerSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('cycle'),
    ...blockerMinistry,
    cycleId: z.string(),
    cycleName: z.string(),
  }),
  z.object({
    kind: z.literal('requirement'),
    ...blockerMinistry,
    cycleId: z.string(),
    cycleName: z.string(),
    eventId: z.string(),
    eventTimeBlockId: z.string(),
  }),
  z.object({
    kind: z.literal('usual_setup'),
    ...blockerMinistry,
    templateTimeBlockId: z.string(),
  }),
]);

/** A 409 archive refusal: the localized envelope plus where the item is used. */
export const archiveBlockedResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  blockers: z.array(archiveBlockerSchema).optional(),
});

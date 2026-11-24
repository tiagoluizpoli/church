import { z } from 'zod';
import { ChurchId, MinistryInvitationId, VolunteerId } from './branded-ids';

/**
 * What a committed redeem persists (never the session) to replay on a
 * same-key retry. Parsed when read back: the stored JSON is outside the type
 * system.
 */
export const storedRedemptionSchema = z.object({
  email: z.string(),
  outcome: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('full-success'),
      volunteerId: z
        .uuid()
        .transform((id) => VolunteerId.from(id))
        .nullable(),
    }),
    z.object({
      kind: z.literal('church-only'),
      sourceChurchName: z.string(),
      destinationChurchName: z.string(),
      destinationChurchId: z.uuid().transform((id) => ChurchId.from(id)),
      ministryInvitationId: z
        .uuid()
        .transform((id) => MinistryInvitationId.from(id)),
      ministryName: z.string(),
    }),
  ]),
});

export type StoredRedemption = z.output<typeof storedRedemptionSchema>;

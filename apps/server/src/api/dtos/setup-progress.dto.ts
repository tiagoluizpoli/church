import { z } from 'zod';

export const setupProgressResponseSchema = z.object({
  churchId: z.uuid(),
  hasMinistry: z.boolean(),
  hasMinistryWithSectorsAndRoles: z.boolean(),
  hasInvitedLeader: z.boolean(),
  hasEventTemplate: z.boolean(),
  hasEverSentCycle: z.boolean(),
});

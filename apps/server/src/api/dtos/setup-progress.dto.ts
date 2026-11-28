import { z } from 'zod';
import { idSchema } from './id.dto';

export const setupProgressResponseSchema = z.object({
  churchId: idSchema,
  hasMinistry: z.boolean(),
  hasMinistryWithSectorsAndRoles: z.boolean(),
  hasInvitedLeader: z.boolean(),
  hasEventTemplate: z.boolean(),
  hasEverSentCycle: z.boolean(),
});

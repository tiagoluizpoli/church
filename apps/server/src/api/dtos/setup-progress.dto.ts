import { z } from 'zod';
import type { ChurchId } from '../../domain/branded-ids';
import type { ISetupProgressManager } from '../../domain/contracts/application/setup-progress-manager';
import { idSchema } from './id.dto';

export const setupProgressResponseSchema = z.object({
  churchId: idSchema,
  hasMinistry: z.boolean(),
  hasMinistryWithSectorsAndRoles: z.boolean(),
  hasInvitedLeader: z.boolean(),
  hasEventTemplate: z.boolean(),
  hasEverSentCycle: z.boolean(),
});

interface SetupProgressResponseInput {
  churchId: ChurchId;
  progress: Awaited<ReturnType<ISetupProgressManager['getSetupProgress']>>;
}

export const setupProgressMapper = {
  toResponse({ churchId, progress }: SetupProgressResponseInput) {
    return { churchId, ...progress };
  },
};

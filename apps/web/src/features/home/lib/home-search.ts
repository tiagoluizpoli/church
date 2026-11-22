import { z } from 'zod';
import { churchOnlyWarningSearchSchema } from '@/shared/utils/church-only-warning';
import { removedFromSearchSchema } from '@/shared/utils/membership-removal';
import { ministryInvitationResultSearchSchema } from '@/shared/utils/ministry-invitation-result';

/** The search context Home (`/app`) and the `/app/dashboard` redirect carry. */
export const homeSearchSchema = removedFromSearchSchema
  .extend(churchOnlyWarningSearchSchema.shape)
  .extend(ministryInvitationResultSearchSchema.shape)
  .extend({
    accessDenied: z.boolean().optional(),
  });

export type HomeSearch = z.infer<typeof homeSearchSchema>;

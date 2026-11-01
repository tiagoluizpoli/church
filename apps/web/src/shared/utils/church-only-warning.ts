import { m } from '@church/i18n/messages';
import { z } from 'zod';

/** Search params a join continuation carries to Home for a Church-only warning; Home never writes admissions. */
export const churchOnlyWarningSearchSchema = z.object({
  joinedChurch: z.string().optional(),
  invitedMinistry: z.string().optional(),
});

export interface ChurchOnlyWarningInput {
  churchName: string;
  ministryName: string;
}

export function churchOnlyWarningMessage({
  churchName,
  ministryName,
}: ChurchOnlyWarningInput): string {
  return m.home_church_only_warning({ churchName, ministryName });
}

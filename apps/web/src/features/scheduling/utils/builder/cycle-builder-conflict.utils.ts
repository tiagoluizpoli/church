import { m } from '@church/i18n/messages';
import type { CycleBuilderEligibleVolunteerSummary } from '../../hooks/use-cycle-builder';
import { timeLabel } from './cycle-builder-date.utils';

interface ConflictReasonInput {
  conflict: CycleBuilderEligibleVolunteerSummary['conflict'];
  timeZone: string;
}

export function conflictReason({
  conflict,
  timeZone,
}: ConflictReasonInput): string | undefined {
  if (!conflict) return undefined;
  const start = timeLabel({ instant: conflict.startTime, timeZone });
  const end = timeLabel({ instant: conflict.endTime, timeZone });
  return m.builder_conflict_reason({
    ministry: conflict.ministryName,
    start,
    end,
  });
}

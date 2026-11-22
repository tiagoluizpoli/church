import { useParams } from '@tanstack/react-router';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

/**
 * Resolves the breadcrumb label for the ministry-id route segment (e.g.
 * `/app/schedules/$ministryId/...`), mirroring
 * `useCycleBreadcrumb`'s pattern for `$cycleId`.
 */
export function useMinistryBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { ministryId, cycleId, timeSlotId } = useParams({ strict: false });
  const ministriesQuery = useMinistryList({
    enabled: ministryId !== undefined && cycleId === undefined,
  });

  const schedules = useSchedule({
    ministryId,
    cycleId,
    enabled: timeSlotId === undefined,
  });
  if (cycleId !== undefined) {
    const schedule = schedules.data;
    return ministryId && schedule
      ? { segment: ministryId, label: schedule.ministry.name }
      : null;
  }
  if (ministryId === undefined || !ministriesQuery.data) {
    return null;
  }

  const ministry = ministriesQuery.data.ministries.find(
    (candidate) => candidate.id === ministryId,
  );

  if (!ministry) {
    return null;
  }

  return { segment: ministryId, label: ministry.name };
}

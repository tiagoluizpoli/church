import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { adminApi } from '@/utils/api-instances';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

/**
 * Resolves the breadcrumb label for the ministry-id route segment (e.g.
 * `/schedules/$ministryId/...`), mirroring
 * `useCycleBreadcrumb`'s pattern for `$cycleId`.
 */
export function useMinistryBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { ministryId, cycleId, timeSlotId } = useParams({ strict: false });
  const ministriesQuery = useQuery({
    queryKey: ['breadcrumb-ministries'],
    queryFn: () => adminApi.listMinistries(),
    enabled: ministryId !== undefined && cycleId === undefined,
    retry: false,
  });

  const schedules = useQuery({
    queryKey: ['prepare-schedules'],
    queryFn: () => adminApi.listSchedules(),
    enabled:
      ministryId !== undefined &&
      cycleId !== undefined &&
      timeSlotId === undefined,
    retry: false,
  });
  if (cycleId !== undefined) {
    const schedule = schedules.data?.schedules.find(
      (row) => row.ministry.id === ministryId && row.cycle.id === cycleId,
    );
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

import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { adminApi } from '@/utils/api-instances';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

/**
 * Resolves the breadcrumb label for the cycle-id route segment.
 * Planning pages use the admin Cycle detail; Schedule pages resolve the
 * same label from the Ministry-scoped summaries available to leaders.
 */
export function useCycleBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { cycleId, ministryId, timeSlotId } = useParams({ strict: false });
  const cycleDetailsQuery = useQuery({
    queryKey: ['cycle-details', cycleId],
    queryFn: () => adminApi.getCycle(cycleId ?? ''),
    enabled: cycleId !== undefined && ministryId === undefined,
    retry: false,
  });
  const schedule = useSchedule({
    ministryId,
    cycleId,
    enabled: timeSlotId === undefined,
  });
  const cycleName = ministryId
    ? schedule.data?.cycle.name
    : cycleDetailsQuery.data?.cycle.name;

  if (cycleId === undefined || !cycleName) {
    return null;
  }

  return { segment: cycleId, label: cycleName };
}

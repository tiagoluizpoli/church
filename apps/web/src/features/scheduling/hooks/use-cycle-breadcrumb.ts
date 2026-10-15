import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { adminApi } from '@/utils/api-instances';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

/**
 * Resolves the breadcrumb label for the planning-cycle-id route segment.
 * `useParams({ strict: false })` only yields `cycleId` when the matched
 * route is `/scheduling/planning-cycles/$cycleId` — the sibling `new` and
 * `templates` routes are separate static routes with no such param, so no
 * manual segment/path exclusion list is needed here.
 */
export function usePlanningCycleBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { cycleId } = useParams({ strict: false });
  const cycleDetailsQuery = useQuery({
    queryKey: ['planning-cycle-details', cycleId],
    queryFn: () => adminApi.getPlanningCycle(cycleId ?? ''),
    enabled: cycleId !== undefined,
    retry: false,
  });

  if (cycleId === undefined || !cycleDetailsQuery.data) {
    return null;
  }

  return { segment: cycleId, label: cycleDetailsQuery.data.cycle.name };
}

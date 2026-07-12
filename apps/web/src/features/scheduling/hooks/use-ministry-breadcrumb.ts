import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { adminApi } from '@/utils/api-instances';

export interface BreadcrumbSegmentOverride {
  segment: string;
  label: string;
}

/**
 * Resolves the breadcrumb label for the ministry-id route segment (e.g.
 * `/scheduling/tailoring/$ministryId/...`), mirroring
 * `usePlanningCycleBreadcrumb`'s pattern for `$cycleId`.
 */
export function useMinistryBreadcrumb(): BreadcrumbSegmentOverride | null {
  const { ministryId } = useParams({ strict: false });
  const ministriesQuery = useQuery({
    queryKey: ['breadcrumb-ministries'],
    queryFn: () => adminApi.listMinistries(),
    enabled: ministryId !== undefined,
    retry: false,
  });

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

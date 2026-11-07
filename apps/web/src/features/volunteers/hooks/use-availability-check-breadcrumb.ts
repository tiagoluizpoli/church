import { skipToken, useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { GetAvailabilityCheck200 } from '@/infrastructure/api/churchAPI.schemas';

interface AvailabilityCheckBreadcrumb {
  segment: string;
  label: string | null;
}

/** Observe the page's authorized read; never fetch a check just to name a crumb. */
export function useAvailabilityCheckBreadcrumb(): AvailabilityCheckBreadcrumb | null {
  const { checkId } = useParams({ strict: false });
  const query = useQuery<GetAvailabilityCheck200>({
    queryKey: ['availability-check', checkId],
    queryFn: skipToken,
  });
  if (!checkId) return null;
  const check = query.isError ? undefined : query.data;
  return {
    segment: checkId,
    label: check ? `${check.ministryName} · ${check.cycleName}` : null,
  };
}

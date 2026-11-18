import { skipToken, useQuery } from '@tanstack/react-query';
import { useLocation, useParams } from '@tanstack/react-router';
import { myMinistryScheduleKey } from '../components/my-ministry-schedule-page';
import type { GetMinistrySchedule200 } from '@/infrastructure/api/churchAPI.schemas';

interface Crumb {
  segment: string;
  label: string | null;
}

/**
 * "Kids · Outubro 2026" on the ministry segment, cycle segment hidden.
 * Observes the page's authorized read; never fetches just to name a crumb.
 */
export function useMyMinistryScheduleBreadcrumb(): Crumb[] {
  const { ministryId, cycleId } = useParams({ strict: false });
  const { pathname } = useLocation();
  const query = useQuery<GetMinistrySchedule200>({
    queryKey: myMinistryScheduleKey({
      ministryId: ministryId ?? '',
      cycleId: cycleId ?? '',
    }),
    queryFn: skipToken,
  });
  // The same params name other routes' Ministry and Cycle crumbs.
  if (!pathname.startsWith('/my-schedule/') || !ministryId || !cycleId) {
    return [];
  }
  const schedule = query.isError ? undefined : query.data;
  return [
    {
      segment: ministryId,
      label: schedule?.published
        ? `${schedule.ministryName} · ${schedule.cycleName}`
        : null,
    },
    { segment: cycleId, label: null },
  ];
}

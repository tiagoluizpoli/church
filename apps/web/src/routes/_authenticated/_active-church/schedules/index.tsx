import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { CyclePreparePicker } from '@/features/scheduling/components/prepare/cycle-prepare-picker';
import { SchedulesListPage } from '@/features/scheduling/components/prepare/schedules-list-page';
import type { ScheduleFilters } from '@/features/scheduling/hooks/use-schedule';

/** N2's multiple-Ministry entry keeps its Cycle and the Ministries it named; the rest are list filters. */
const schedulesSearchSchema = z.object({
  cycleId: z.string().optional(),
  ministryIds: z.string().optional(),
  period: z.enum(['current', 'past', 'all']).optional().catch(undefined),
  ministryId: z.string().uuid().optional().catch(undefined),
  stage: z
    .enum(['to_prepare', 'asking', 'assigning', 'published', 'not_serving'])
    .optional()
    .catch(undefined),
  search: z.string().trim().min(1).max(100).optional().catch(undefined),
  attention: z.literal(true).optional().catch(undefined),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/',
)({
  validateSearch: (search) => schedulesSearchSchema.parse(search),
  component: SchedulesEntryRoute,
});

function SchedulesEntryRoute() {
  const { cycleId, ministryIds, ...filters } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const onFiltersChange = useCallback(
    (next: ScheduleFilters) => {
      const trim = (path: string) => path.replace(/\/+$/, '');
      if (
        trim(router.latestLocation.pathname) !==
        trim(router.buildLocation({ to: '/schedules' }).pathname)
      )
        return;
      navigate({ search: next, replace: true });
    },
    [navigate, router],
  );
  return cycleId ? (
    <CyclePreparePicker
      cycleId={cycleId}
      ministryIds={ministryIds?.split(',') ?? []}
    />
  ) : (
    <SchedulesListPage filters={filters} onFiltersChange={onFiltersChange} />
  );
}

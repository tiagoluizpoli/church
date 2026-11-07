import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CyclePreparePicker } from '@/features/scheduling/components/prepare/cycle-prepare-picker';
import { SchedulesListPage } from '@/features/scheduling/components/prepare/schedules-list-page';

/** N2's multiple-Ministry entry keeps its Cycle and the Ministries it named. */
const schedulesSearchSchema = z.object({
  cycleId: z.string().optional(),
  ministryIds: z.string().optional(),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/',
)({
  validateSearch: (search) => schedulesSearchSchema.parse(search),
  component: SchedulesEntryRoute,
});

function SchedulesEntryRoute() {
  const { cycleId, ministryIds } = Route.useSearch();
  return cycleId ? (
    <CyclePreparePicker
      cycleId={cycleId}
      ministryIds={ministryIds?.split(',') ?? []}
    />
  ) : (
    <SchedulesListPage />
  );
}

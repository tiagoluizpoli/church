import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { useCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';

const cyclesSearchSchema = z.object({
  status: z.enum(['draft', 'sent', 'past', 'all']).optional().catch(undefined),
  search: z.string().trim().min(1).max(100).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
});

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/',
)({
  validateSearch: (search) => cyclesSearchSchema.parse(search),
  component: CyclesIndexRoute,
});

function CyclesIndexRoute() {
  const navigate = Route.useNavigate();
  const filters = Route.useSearch();
  const { handleClearSelectedCycle } = useCycleSelection();

  useEffect(() => {
    handleClearSelectedCycle();
  }, [handleClearSelectedCycle]);

  return (
    <CycleListCard
      filters={filters}
      onFiltersChange={(next) => navigate({ search: next, replace: true })}
    />
  );
}

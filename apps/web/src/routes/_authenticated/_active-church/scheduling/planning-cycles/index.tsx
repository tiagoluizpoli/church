import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { usePlanningCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/planning-cycles/',
)({
  component: PlanningCyclesIndexRoute,
});

function PlanningCyclesIndexRoute() {
  const navigate = Route.useNavigate();
  const { handleClearSelectedCycle } = usePlanningCycleSelection();

  useEffect(() => {
    handleClearSelectedCycle();
  }, [handleClearSelectedCycle]);

  return (
    <CycleListCard
      onSelectCycle={({ cycleId }) => {
        navigate({
          to: '/scheduling/planning-cycles/$cycleId',
          params: { cycleId },
        });
      }}
    />
  );
}

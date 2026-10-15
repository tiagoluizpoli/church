import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { useCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/',
)({
  component: CyclesIndexRoute,
});

function CyclesIndexRoute() {
  const navigate = Route.useNavigate();
  const { handleClearSelectedCycle } = useCycleSelection();

  useEffect(() => {
    handleClearSelectedCycle();
  }, [handleClearSelectedCycle]);

  return (
    <CycleListCard
      onSelectCycle={({ cycleId }) => {
        navigate({
          to: '/cycles/$cycleId',
          params: { cycleId },
        });
      }}
    />
  );
}

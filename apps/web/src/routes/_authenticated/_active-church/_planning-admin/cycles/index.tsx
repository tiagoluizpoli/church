import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { NewCycleDialog } from '@/features/scheduling/components/planning-admin/new-cycle-dialog';
import { useCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/',
)({
  component: CyclesIndexRoute,
});

function CyclesIndexRoute() {
  const navigate = Route.useNavigate();
  const { handleClearSelectedCycle } = useCycleSelection();
  // Plain local state: opening or cancelling New cycle never touches the URL.
  const [newCycleOpen, setNewCycleOpen] = useState(false);

  useEffect(() => {
    handleClearSelectedCycle();
  }, [handleClearSelectedCycle]);

  return (
    <>
      <CycleListCard
        onNewCycle={() => setNewCycleOpen(true)}
        onSelectCycle={({ cycleId }) => {
          navigate({
            to: '/cycles/$cycleId',
            params: { cycleId },
          });
        }}
      />
      <NewCycleDialog open={newCycleOpen} onOpenChange={setNewCycleOpen} />
    </>
  );
}

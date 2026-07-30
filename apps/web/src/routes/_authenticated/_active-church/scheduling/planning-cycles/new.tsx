import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { CreateCycleForm } from '@/features/scheduling/components/planning-admin/create-cycle-form';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import {
  useCreateCycleCard,
  usePlanningCycleSelection,
} from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/planning-cycles/new',
)({
  component: NewPlanningCycleRoute,
});

function NewPlanningCycleRoute() {
  const { selectedCycleId } = usePlanningCycleSelection();
  const { canCreateCycle, createCyclePending, handleCreateCycle } =
    useCreateCycleCard();
  const navigate = Route.useNavigate();
  const selectionOnEntry = useRef(selectedCycleId);

  useEffect(() => {
    if (selectedCycleId && selectedCycleId !== selectionOnEntry.current) {
      navigate({
        to: '/scheduling/planning-cycles/$cycleId',
        params: { cycleId: selectedCycleId },
      });
    }
  }, [navigate, selectedCycleId]);

  function handleOpenChange(open: boolean) {
    if (!open) {
      navigate({ to: '/scheduling/planning-cycles' });
    }
  }

  return (
    <>
      <CycleListCard />

      <ResponsiveFormSurface
        open
        onOpenChange={handleOpenChange}
        title="Create cycle"
        description="Define the date range first, then move into review when the cycle is ready for templates and exceptions."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="create-cycle-button"
              disabled={!canCreateCycle || createCyclePending}
              onClick={handleCreateCycle}
            >
              {createCyclePending ? 'Creating…' : 'Create cycle'}
            </Button>
          </>
        }
      >
        <CreateCycleForm hideSubmitButton />
      </ResponsiveFormSurface>
    </>
  );
}

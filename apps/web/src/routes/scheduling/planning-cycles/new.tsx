import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { CreateCycleForm } from '@/features/scheduling/components/planning-admin/create-cycle-form';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';
import { usePlanningCycleSelection } from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute('/scheduling/planning-cycles/new')({
  component: NewPlanningCycleRoute,
});

function NewPlanningCycleRoute() {
  const { selectedCycleId } = usePlanningCycleSelection();
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

      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create cycle</DialogTitle>
            <DialogDescription>
              Define the date range first, then move into review when the cycle
              is ready for templates and exceptions.
            </DialogDescription>
          </DialogHeader>
          <CreateCycleForm submitButtonClassName="w-full justify-center sm:w-auto" />
        </DialogContent>
      </Dialog>
    </>
  );
}

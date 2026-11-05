import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import { cycleIsSent } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import {
  useCycleReviewCard,
  useCycleSelection,
} from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/cycles/$cycleId',
)({
  component: CycleReviewRoute,
});

function CycleReviewRoute() {
  const { cycleId } = Route.useParams();
  const { selectedCycleId, handleSelectCycle } = useCycleSelection();
  const { selectedCycle } = useCycleReviewCard();

  useEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId, handleSelectCycle]);

  const isReadOnly = cycleIsSent({ cycle: selectedCycle });

  // Until the selection follows the URL it still points at the previous Cycle.
  if (selectedCycleId !== cycleId) {
    return null;
  }

  return <CycleReviewCard isReadOnly={isReadOnly} />;
}

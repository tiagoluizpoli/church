import { createFileRoute } from '@tanstack/react-router';
import { useLayoutEffect } from 'react';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import { cycleIsReadOnly } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
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
  const { handleSelectCycle } = useCycleSelection();
  const { selectedCycle } = useCycleReviewCard();

  // Before paint, so a previously selected Cycle is never shown for this id.
  useLayoutEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId, handleSelectCycle]);

  const isReadOnly = cycleIsReadOnly({ cycle: selectedCycle });

  return <CycleReviewCard cycleId={cycleId} isReadOnly={isReadOnly} />;
}

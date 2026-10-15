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
  const { handleSelectCycle } = useCycleSelection();
  const { selectedCycle } = useCycleReviewCard();

  useEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId, handleSelectCycle]);

  const isReadOnly = cycleIsSent({ cycle: selectedCycle });

  return <CycleReviewCard isReadOnly={isReadOnly} />;
}

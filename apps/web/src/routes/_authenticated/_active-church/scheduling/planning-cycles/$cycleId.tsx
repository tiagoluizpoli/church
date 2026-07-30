import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import { cycleIsLocked } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import {
  useCycleReviewCard,
  usePlanningCycleSelection,
} from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/planning-cycles/$cycleId',
)({
  component: PlanningCycleReviewRoute,
});

function PlanningCycleReviewRoute() {
  const { cycleId } = Route.useParams();
  const { handleSelectCycle } = usePlanningCycleSelection();
  const { selectedCycle } = useCycleReviewCard();

  useEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId, handleSelectCycle]);

  const isReadOnly = cycleIsLocked({ cycle: selectedCycle });

  return <CycleReviewCard isReadOnly={isReadOnly} />;
}

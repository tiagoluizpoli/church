import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { CycleReviewCard } from '@/features/scheduling/components/planning-admin/cycle-review-card';
import { cycleIsLocked } from '@/features/scheduling/components/planning-admin/planning-admin.utils';
import {
  useCycleReviewCard,
  usePlanningCycleSelection,
} from '@/features/scheduling/components/planning-admin/planning-admin-context';

export const Route = createFileRoute('/scheduling/planning-cycles/$cycleId')({
  component: PlanningCycleReviewRoute,
});

function PlanningCycleReviewRoute() {
  const { cycleId } = Route.useParams();
  const { handleSelectCycle } = usePlanningCycleSelection();
  const { selectedCycle } = useCycleReviewCard();

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleSelectCycle is a new reference every render (usePlanningAdmin isn't memoized); only the URL's cycleId segment should retrigger this sync.
  useEffect(() => {
    handleSelectCycle({ cycleId });
  }, [cycleId]);

  const isReadOnly = cycleIsLocked({ cycle: selectedCycle });

  return <CycleReviewCard isReadOnly={isReadOnly} />;
}

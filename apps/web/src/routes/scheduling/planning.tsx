import { createFileRoute } from '@tanstack/react-router';
import { PlanningAdmin } from '@/features/scheduling/components/planning-admin';

export const Route = createFileRoute('/scheduling/planning')({
  component: SchedulingPlanningRoute,
});

function SchedulingPlanningRoute() {
  return <PlanningAdmin />;
}

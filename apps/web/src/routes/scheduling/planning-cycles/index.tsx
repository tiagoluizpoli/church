import { createFileRoute } from '@tanstack/react-router';
import { CycleListCard } from '@/features/scheduling/components/planning-admin/cycle-list-card';

export const Route = createFileRoute('/scheduling/planning-cycles/')({
  component: PlanningCyclesIndexRoute,
});

function PlanningCyclesIndexRoute() {
  const navigate = Route.useNavigate();

  return (
    <CycleListCard
      onSelectCycle={({ cycleId }) => {
        navigate({
          to: '/scheduling/planning-cycles/$cycleId',
          params: { cycleId },
        });
      }}
    />
  );
}

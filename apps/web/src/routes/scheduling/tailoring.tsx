import { createFileRoute } from '@tanstack/react-router';
import { ParticipationTailoring } from '@/features/scheduling/components/participation-tailoring';

export const Route = createFileRoute('/scheduling/tailoring')({
  component: SchedulingTailoringRoute,
});

function SchedulingTailoringRoute() {
  return <ParticipationTailoring />;
}

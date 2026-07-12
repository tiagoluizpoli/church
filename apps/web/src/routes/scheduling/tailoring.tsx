import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/scheduling/tailoring')({
  component: SchedulingTailoringLayout,
});

function SchedulingTailoringLayout() {
  return <Outlet />;
}

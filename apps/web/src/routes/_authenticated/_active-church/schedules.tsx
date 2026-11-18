import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules',
)({
  component: SchedulingPrepareLayout,
});

function SchedulingPrepareLayout() {
  return <Outlet />;
}

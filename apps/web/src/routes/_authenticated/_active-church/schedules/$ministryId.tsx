import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/schedules/$ministryId',
)({
  component: PrepareMinistryLayout,
});

function PrepareMinistryLayout() {
  return <Outlet />;
}

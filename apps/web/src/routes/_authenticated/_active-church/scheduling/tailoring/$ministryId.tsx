import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling/tailoring/$ministryId',
)({
  component: PrepareMinistryLayout,
});

function PrepareMinistryLayout() {
  return <Outlet />;
}

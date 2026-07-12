import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/scheduling/tailoring/$ministryId')({
  component: TailoringMinistryLayout,
});

function TailoringMinistryLayout() {
  return <Outlet />;
}

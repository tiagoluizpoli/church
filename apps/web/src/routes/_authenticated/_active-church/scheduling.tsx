import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/scheduling',
)({
  component: SchedulingLayout,
});

function SchedulingLayout() {
  return (
    <div className="w-full">
      <Outlet />
    </div>
  );
}

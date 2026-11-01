import { createFileRoute } from '@tanstack/react-router';
import {
  DashboardEntry,
  dashboardSearchSchema,
} from '@/features/volunteers/components/dashboard-entry';

export const Route = createFileRoute(
  '/_authenticated/_active-church/dashboard',
)({
  validateSearch: (search) => dashboardSearchSchema.parse(search),
  component: RouteComponent,
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  return (
    <DashboardEntry
      search={Route.useSearch()}
      volunteerName={session.data?.user.name}
    />
  );
}

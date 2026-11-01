import { createFileRoute } from '@tanstack/react-router';
import {
  DashboardEntry,
  dashboardSearchSchema,
} from '@/features/volunteers/components/dashboard-entry';

// Home: the common entry after login and onboarding. Existing dashboard
// content backs it until Spec 31 (#431) composes the final Home.
export const Route = createFileRoute('/_authenticated/_active-church/')({
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

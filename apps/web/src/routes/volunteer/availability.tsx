import { createFileRoute, redirect } from '@tanstack/react-router';
import { VolunteerAvailabilityPage } from '@/features/volunteers/components/volunteer-availability-page';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/volunteer/availability')({
  component: VolunteerAvailabilityRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function VolunteerAvailabilityRoute() {
  return (
    <div className="container mx-auto px-4 py-10">
      <VolunteerAvailabilityPage />
    </div>
  );
}

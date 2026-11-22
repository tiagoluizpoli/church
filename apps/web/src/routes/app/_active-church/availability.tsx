import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';

const availabilitySearchSchema = z.object({
  answered: z.string().optional(),
});

export const Route = createFileRoute('/app/_active-church/availability')({
  head: () => ({ meta: [{ title: m.nav_availability() }] }),
  validateSearch: (search) => availabilitySearchSchema.parse(search),
  component: AvailabilityRoute,
});

function AvailabilityRoute() {
  const { answered } = Route.useSearch();
  return <AvailabilityListPage answeredCheckId={answered} />;
}

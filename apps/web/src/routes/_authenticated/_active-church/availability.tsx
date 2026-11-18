import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/availability',
)({
  head: () => ({ meta: [{ title: m.nav_availability() }] }),
  component: AvailabilityListPage,
});

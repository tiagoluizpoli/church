import { createFileRoute } from '@tanstack/react-router';
import { AvailabilityListPage } from '@/features/volunteers/components/availability-list-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/availability',
)({
  component: AvailabilityListPage,
});

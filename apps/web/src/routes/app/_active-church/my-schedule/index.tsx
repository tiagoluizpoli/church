import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { MySchedulePage } from '@/features/volunteers/components/my-schedule-page';
import {
  type MyScheduleFilters,
  myScheduleSearchSchema,
} from '@/features/volunteers/lib/my-schedule-filters';
import { CapabilityGate } from '@/shared/components/capability-gate';

export const Route = createFileRoute('/app/_active-church/my-schedule/')({
  validateSearch: (search) => myScheduleSearchSchema.parse(search),
  component: MyScheduleRoute,
});

function MyScheduleRoute() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const onFiltersChange = useCallback(
    (next: MyScheduleFilters) => navigate({ search: next, replace: true }),
    [navigate],
  );
  return (
    <CapabilityGate
      allow={({ hasVolunteerMembership }) => hasVolunteerMembership}
      refusal="not-serving"
    >
      <MySchedulePage filters={filters} onFiltersChange={onFiltersChange} />
    </CapabilityGate>
  );
}

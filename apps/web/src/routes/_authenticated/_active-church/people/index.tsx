import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { PeopleDirectoryPage } from '@/features/people/components/people-directory-page';
import {
  PEOPLE_SEARCH_MAX_LENGTH,
  type PeopleFilters,
} from '@/features/people/people-queries';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

/** The directory's filters live in the URL so a return from a person restores them; a malformed value is dropped, not an error. */
const peopleSearchSchema = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .max(PEOPLE_SEARCH_MAX_LENGTH)
    .optional()
    .catch(undefined),
  ministryId: z.string().uuid().optional().catch(undefined),
  access: z.enum(['admin', 'leader', 'volunteer']).optional().catch(undefined),
  // The router parses `?withoutMinistry=true` to a boolean; only `true` filters.
  withoutMinistry: z.literal(true).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/_active-church/people/')({
  validateSearch: (search) => peopleSearchSchema.parse(search),
  component: PeoplePage,
});

function PeoplePage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const onFiltersChange = useCallback(
    (next: PeopleFilters) => {
      // A late debounced search must not pull the user back from a person they opened; latestLocation already
      // holds an in-flight navigation, which the resolved matches do not.
      const here = router.buildLocation({ to: '/people' }).pathname;
      const trim = (path: string) => path.replace(/\/+$/, '');
      if (trim(router.latestLocation.pathname) !== trim(here)) return;
      navigate({ search: next, replace: true });
    },
    [router, navigate],
  );
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <PeopleDirectoryPage
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </CapabilityGate>
  );
}

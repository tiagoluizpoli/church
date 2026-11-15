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
      // A late debounced search must not pull the user back from a person they opened.
      const stillHere = router.state.matches.some(
        (match) => match.routeId === Route.id,
      );
      if (!stillHere) return;
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

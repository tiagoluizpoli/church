import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { PeopleDirectoryPage } from '@/features/people/components/people-directory-page';
import type { PeopleFilters } from '@/features/people/people-queries';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

/** The directory's filters live in the URL so a return from a person restores them; a malformed value is dropped, not an error. */
const peopleSearchSchema = z.object({
  search: z.string().trim().min(1).max(254).optional().catch(undefined),
  ministryId: z.string().min(1).optional().catch(undefined),
  access: z.enum(['admin', 'leader', 'volunteer']).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/_active-church/people/')({
  validateSearch: (search) => peopleSearchSchema.parse(search),
  component: PeoplePage,
});

function PeoplePage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <PeopleDirectoryPage
        filters={filters}
        onFiltersChange={(next: PeopleFilters) =>
          navigate({ search: next, replace: true })
        }
      />
    </CapabilityGate>
  );
}

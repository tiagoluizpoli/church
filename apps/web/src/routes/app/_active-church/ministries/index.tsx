import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { MinistryListPage } from '@/features/ministries/components/ministry-list-page';
import type { MinistryDirectoryFilters } from '@/features/ministries/ministry-queries';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute('/app/_active-church/ministries/')({
  validateSearch: (search) =>
    z
      .object({
        search: z.string().trim().min(1).max(255).optional().catch(undefined),
        status: z
          .enum(['any', 'review', 'no-sectors'])
          .optional()
          .catch(undefined),
      })
      .parse(search),
  component: MinistriesPage,
});

function MinistriesPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const onFiltersChange = useCallback(
    (next: MinistryDirectoryFilters) => {
      const trim = (path: string) => path.replace(/\/+$/, '');
      // A debounced change landing after the user left must not navigate back.
      if (
        trim(router.latestLocation.pathname) !==
        trim(router.buildLocation({ to: '/app/ministries' }).pathname)
      )
        return;
      navigate({ search: next, replace: true });
    },
    [navigate, router],
  );
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <MinistryListPage filters={filters} onFiltersChange={onFiltersChange} />
    </CapabilityGate>
  );
}

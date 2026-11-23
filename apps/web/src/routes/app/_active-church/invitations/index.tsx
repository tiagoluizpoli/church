import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { InvitationListPage } from '@/features/invitations/components/invitation-list-page';
import type { InvitationFilters } from '@/features/invitations/invitation-queries';
import { CapabilityGate } from '@/shared/components/capability-gate';
import { isAdminOrLeader } from '@/shared/hooks/use-caller-capabilities';

export const Route = createFileRoute('/app/_active-church/invitations/')({
  validateSearch: (search) =>
    z
      .object({
        email: z.string().trim().min(1).max(254).optional().catch(undefined),
        status: z
          .enum([
            'pending',
            'expired',
            'accepted',
            'declined',
            'revoked',
            'any',
          ])
          .optional()
          .catch(undefined),
        ministryId: z.string().uuid().optional().catch(undefined),
        invitedAs: z
          .enum(['admin', 'leader', 'volunteer'])
          .optional()
          .catch(undefined),
      })
      .parse(search),
  component: InvitationsPage,
});

function InvitationsPage() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const onFiltersChange = useCallback(
    (next: InvitationFilters) => {
      const trim = (path: string) => path.replace(/\/+$/, '');
      if (
        trim(router.latestLocation.pathname) !==
        trim(router.buildLocation({ to: '/app/invitations' }).pathname)
      )
        return;
      navigate({ search: next, replace: true });
    },
    [navigate, router],
  );
  return (
    <CapabilityGate allow={isAdminOrLeader} refusal="no-access">
      <InvitationListPage filters={filters} onFiltersChange={onFiltersChange} />
    </CapabilityGate>
  );
}

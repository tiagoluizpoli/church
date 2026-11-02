import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/roles',
)({
  component: MinistryRolesRoute,
});

/** Handoff to the Role registry (#651). */
function MinistryRolesRoute() {
  return <ComingSoonPage title={m.ministry_tab_roles()} />;
}

import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { ComingSoonPage } from '@/shared/components/coming-soon-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/usual-setup',
)({
  component: MinistryUsualSetupRoute,
});

/** Handoff to Spec 14's Usual setup editor. */
function MinistryUsualSetupRoute() {
  return <ComingSoonPage title={m.ministry_tab_usual_setup()} />;
}

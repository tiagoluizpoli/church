import { createFileRoute } from '@tanstack/react-router';
import { UsualSetupBlockEditor } from '@/features/ministries/components/usual-setup/usual-setup-block-editor';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/usual-setup/$blockId',
)({
  component: MinistryUsualSetupBlockRoute,
});

function MinistryUsualSetupBlockRoute() {
  const { ministryId, blockId } = Route.useParams();
  return <UsualSetupBlockEditor ministryId={ministryId} blockId={blockId} />;
}

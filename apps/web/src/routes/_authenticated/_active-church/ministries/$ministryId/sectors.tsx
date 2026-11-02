import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/_active-church/ministries/$ministryId/sectors',
)({
  component: MinistrySectorsRoute,
});

/** The setup instruction; the Sector registry (#650) renders here. */
function MinistrySectorsRoute() {
  return (
    <p className="text-muted-foreground" role="status">
      {m.ministry_sectors_empty()}
    </p>
  );
}

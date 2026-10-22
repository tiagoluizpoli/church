import { m } from '@church/i18n/messages';
import { createFileRoute } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/shared/hooks/use-sign-out';
import {
  MEMBERSHIP_REMOVED_PREFIX,
  MEMBERSHIP_REMOVED_SUFFIX,
  removedFromSearchSchema,
} from '@/shared/utils/membership-removal';

export const Route = createFileRoute('/_authenticated/no-access')({
  validateSearch: (search) => removedFromSearchSchema.parse(search),
  component: NoAccessRoute,
});

function NoAccessRoute() {
  const { removedFrom } = Route.useSearch();
  const signOut = useSignOut();

  return (
    <div className="workspace-page">
      <div className="workspace-section-header">
        <h1 className="text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
          {m.no_access_title()}
        </h1>
        <p className="workspace-section-description">
          {removedFrom ? (
            <>
              {MEMBERSHIP_REMOVED_PREFIX}
              <strong>{removedFrom}</strong>
              {MEMBERSHIP_REMOVED_SUFFIX}
            </>
          ) : (
            m.no_access_generic_body()
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => signOut()}
        >
          <LogOut />
          {m.no_access_sign_out()}
        </Button>
      </div>
    </div>
  );
}

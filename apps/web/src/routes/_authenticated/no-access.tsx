import { createFileRoute } from '@tanstack/react-router';
import { removedFromSearchSchema } from '@/shared/utils/membership-removal';

export const Route = createFileRoute('/_authenticated/no-access')({
  validateSearch: (search) => removedFromSearchSchema.parse(search),
  component: NoAccessRoute,
});

function NoAccessRoute() {
  const { removedFrom } = Route.useSearch();

  return (
    <div className="workspace-page">
      <div className="workspace-section-header">
        <h1 className="text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
          No Church access
        </h1>
        <p className="workspace-section-description">
          {removedFrom ? (
            <>
              You no longer have access to <strong>{removedFrom}</strong>. Your
              Church Membership was removed.
            </>
          ) : (
            <>
              Your account isn't currently linked to an active Church. Ask a
              Church admin to restore your Church Membership.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

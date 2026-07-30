import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/no-access')({
  component: NoAccessRoute,
});

function NoAccessRoute() {
  return (
    <div className="workspace-page">
      <div className="workspace-section-header">
        <h1 className="text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
          No Church access
        </h1>
        <p className="workspace-section-description">
          Your account isn't currently linked to an active Church. Ask a Church
          admin to restore your Church Membership.
        </p>
      </div>
    </div>
  );
}

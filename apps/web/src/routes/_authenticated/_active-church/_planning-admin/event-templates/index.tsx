import { m } from '@church/i18n/messages';
import { createFileRoute, Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { TemplateManagerCard } from '@/features/scheduling/components/planning-admin/template-manager-card';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/event-templates/',
)({
  component: TemplateLibraryRoute,
});

function TemplateLibraryRoute() {
  return (
    <>
      <div className="flex justify-end">
        <Link
          to="/event-templates/new"
          data-testid="new-template-button"
          className={buttonVariants()}
        >
          {m.event_templates_new()}
        </Link>
      </div>

      <TemplateManagerCard />
    </>
  );
}

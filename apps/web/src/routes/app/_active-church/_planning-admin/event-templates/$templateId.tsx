import { createFileRoute } from '@tanstack/react-router';
import { TemplateEditDialog } from '@/features/scheduling/components/planning-admin/template-edit-dialog';

export const Route = createFileRoute(
  '/app/_active-church/_planning-admin/event-templates/$templateId',
)({
  component: TemplateEditRoute,
});

function TemplateEditRoute() {
  const { templateId } = Route.useParams();
  return <TemplateEditDialog key={templateId} templateId={templateId} />;
}

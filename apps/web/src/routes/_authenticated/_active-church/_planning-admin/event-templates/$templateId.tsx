import { createFileRoute } from '@tanstack/react-router';
import { TemplateEditPage } from '@/features/scheduling/components/planning-admin/template-edit-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/event-templates/$templateId',
)({
  component: TemplateEditRoute,
});

function TemplateEditRoute() {
  const { templateId } = Route.useParams();
  return <TemplateEditPage templateId={templateId} />;
}

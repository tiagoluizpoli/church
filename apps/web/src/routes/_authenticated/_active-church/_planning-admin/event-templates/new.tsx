import { createFileRoute } from '@tanstack/react-router';
import { TemplateCreatePage } from '@/features/scheduling/components/planning-admin/template-create-page';

export const Route = createFileRoute(
  '/_authenticated/_active-church/_planning-admin/event-templates/new',
)({
  component: TemplateCreatePage,
});

import { createFileRoute } from '@tanstack/react-router';
import { TemplateCreatePage } from '@/features/scheduling/components/planning-admin/template-create-page';

export const Route = createFileRoute(
  '/app/_active-church/_planning-admin/event-templates/new',
)({
  component: TemplateCreatePage,
});

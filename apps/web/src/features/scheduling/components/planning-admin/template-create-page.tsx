import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { TemplateEditorForm } from './template-editor-form';
import { useCreateTemplate } from './use-create-template';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function TemplateCreatePage() {
  const editor = useCreateTemplate();

  return (
    <Card className="surface-panel" data-testid="template-create-page">
      <CardHeader>
        <CardTitle>{m.event_templates_create_title()}</CardTitle>
        <CardDescription>
          {m.event_templates_create_description()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TemplateEditorForm
          {...editor}
          actions={
            <Link
              to="/event-templates"
              data-testid="cancel-template-button"
              className={buttonVariants({ variant: 'outline' })}
            >
              {m.event_templates_cancel()}
            </Link>
          }
        />
      </CardContent>
    </Card>
  );
}

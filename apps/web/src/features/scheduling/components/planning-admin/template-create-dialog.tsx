import { m } from '@church/i18n/messages';
import { useNavigate } from '@tanstack/react-router';
import { TemplateCollisionDialog } from './template-collision-dialog';
import {
  TemplateEditorFooter,
  TemplateEditorForm,
} from './template-editor-form';
import { useCreateTemplate } from './use-create-template';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';

/** Route-driven: open while `/app/event-templates/new` is, closing returns to the list. */
export function TemplateCreateDialog() {
  const { collisionDialog, ...editor } = useCreateTemplate();
  const navigate = useNavigate();
  const close = () => navigate({ to: '/app/event-templates' });

  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      wide
      closeDisabled={editor.pending}
      title={m.event_templates_create_title()}
      description={m.event_templates_create_description()}
      data-testid="template-create-dialog"
      footer={<TemplateEditorFooter {...editor} onCancel={close} />}
    >
      <TemplateEditorForm {...editor} />
      <TemplateCollisionDialog {...collisionDialog} />
    </ResponsiveFormSurface>
  );
}

import { m } from '@church/i18n/messages';
import { TemplatePrecedenceList } from './template-precedence-list';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';

export interface TemplatePrecedencesDialogProps {
  templateId: string;
  templateName: string;
  onClose: () => void;
}

/** A template's precedences, off its row: each answer saves on its own. */
export function TemplatePrecedencesDialog({
  templateId,
  templateName,
  onClose,
}: TemplatePrecedencesDialogProps) {
  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.event_templates_precedences_dialog_title({ name: templateName })}
      description={m.event_templates_precedences_description()}
      data-testid="template-precedences-dialog"
    >
      <TemplatePrecedenceList templateId={templateId} />
    </ResponsiveFormSurface>
  );
}

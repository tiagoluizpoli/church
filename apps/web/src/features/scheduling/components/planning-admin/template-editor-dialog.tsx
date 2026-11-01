import { m } from '@church/i18n/messages';
import { useTemplateEditor } from './planning-admin-context';
import { TemplateEditorForm } from './template-editor-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
}: TemplateEditorDialogProps) {
  const editor = useTemplateEditor();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.event_templates_edit_title()}</DialogTitle>
          <DialogDescription>
            {m.event_templates_edit_description()}
          </DialogDescription>
        </DialogHeader>
        {/* Edit still runs through the planning-admin state until its nested page lands. */}
        <TemplateEditorForm
          form={editor.templateForm}
          mode="edit"
          canSave={editor.canCreateTemplate}
          pending={editor.saveTemplatePending}
          onNameChange={editor.handleTemplateNameChange}
          onWeekdayChange={editor.handleTemplateWeekdayChange}
          onBlockChange={editor.handleTemplateTimeBlockChange}
          onRemoveBlock={editor.handleRemoveTemplateTimeBlock}
          onAddBlock={editor.handleAddTemplateTimeBlock}
          onSave={editor.handleSaveTemplate}
          submitButtonClassName="w-full justify-center sm:w-auto"
        />
      </DialogContent>
    </Dialog>
  );
}

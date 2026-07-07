import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { useTemplateEditor } from './planning-admin-context';
import { TemplateEditorForm } from './template-editor-form';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
}: TemplateEditorDialogProps) {
  const { editingTemplateId } = useTemplateEditor();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingTemplateId ? 'Edit template' : 'Create template'}
          </DialogTitle>
          <DialogDescription>
            {editingTemplateId
              ? 'Update the reusable weekday rhythm, then save the changes back into the template library.'
              : 'Build a reusable weekday rhythm, then return to the library or apply it to a cycle when you are ready.'}
          </DialogDescription>
        </DialogHeader>
        <TemplateEditorForm submitButtonClassName="w-full justify-center sm:w-auto" />
      </DialogContent>
    </Dialog>
  );
}

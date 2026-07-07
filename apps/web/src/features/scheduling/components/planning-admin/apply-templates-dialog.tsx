import { Button } from '@church/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { describeTemplate } from './planning-admin.utils';
import { useTemplateApplyDialog } from './planning-admin-context';

interface ApplyTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCycleName: string;
}

export function ApplyTemplatesDialog({
  open,
  onOpenChange,
  selectedCycleName,
}: ApplyTemplatesDialogProps) {
  const {
    templates,
    templatesLoading,
    selectedTemplateIds,
    selectedCycleId,
    applyTemplatesPending,
    handleToggleTemplateSelection,
    handleApplyTemplates,
  } = useTemplateApplyDialog();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply templates</DialogTitle>
          <DialogDescription>
            Choose the saved rhythms you want to generate inside{' '}
            {selectedCycleName}.
          </DialogDescription>
        </DialogHeader>

        {templatesLoading ? (
          <p className="text-muted-foreground text-sm">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No templates yet. Build one in the template library first.
          </p>
        ) : (
          <div className="max-h-[22rem] space-y-3 overflow-y-auto pr-1">
            {templates.map((template) => (
              <label
                key={template.id}
                className="surface-subtle workspace-panel flex cursor-pointer items-start gap-3"
                data-testid="apply-template-option"
              >
                <input
                  type="checkbox"
                  className="radius-control mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                  data-testid="template-select-checkbox"
                  checked={selectedTemplateIds.includes(template.id)}
                  onChange={(event) =>
                    handleToggleTemplateSelection({
                      templateId: template.id,
                      checked: event.target.checked,
                    })
                  }
                />
                <div className="space-y-1">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {describeTemplate({ template })}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter showCloseButton={true}>
          <Button
            type="button"
            data-testid="apply-templates-button"
            disabled={
              selectedCycleId === null ||
              selectedTemplateIds.length === 0 ||
              applyTemplatesPending
            }
            onClick={() => {
              handleApplyTemplates();
              onOpenChange(false);
            }}
          >
            {applyTemplatesPending ? 'Applying…' : 'Apply selected templates'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

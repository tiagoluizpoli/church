import { useEffect, useRef } from 'react';
import { describeTemplate } from './planning-admin.utils';
import { useTemplateApplyDialog } from './planning-admin-context';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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
    applyTemplatesError,
    resetApplyTemplates,
    handleToggleTemplateSelection,
    handleApplyTemplates,
  } = useTemplateApplyDialog();

  const resetRef = useRef(resetApplyTemplates);
  useEffect(() => {
    resetRef.current = resetApplyTemplates;
  }, [resetApplyTemplates]);

  useEffect(() => {
    if (!open) {
      resetRef.current();
    }
  }, [open]);

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
              <Label
                key={template.id}
                className="surface-subtle workspace-panel cursor-pointer items-start gap-3"
                data-testid="apply-template-option"
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  data-testid="template-select-checkbox"
                  checked={selectedTemplateIds.includes(template.id)}
                  onCheckedChange={(checked) =>
                    handleToggleTemplateSelection({
                      templateId: template.id,
                      checked,
                    })
                  }
                />
                <div className="space-y-1">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {describeTemplate({ template })}
                  </div>
                </div>
              </Label>
            ))}
          </div>
        )}

        {applyTemplatesError && (
          <div
            className="text-destructive text-sm"
            data-testid="apply-templates-error"
          >
            {applyTemplatesError}
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
              handleApplyTemplates({
                onSuccess: () => {
                  onOpenChange(false);
                },
              });
            }}
          >
            {applyTemplatesPending ? 'Applying…' : 'Apply selected templates'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

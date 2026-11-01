import { m } from '@church/i18n/messages';
import type { RemovedBlockUsage } from './use-edit-template';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface TemplateBlockRemovalDialogProps {
  blocks: RemovedBlockUsage[];
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Lists each removed block that still has Usual setup, with its own Ministry count. */
export function TemplateBlockRemovalDialog({
  blocks,
  open,
  pending,
  onConfirm,
  onCancel,
}: TemplateBlockRemovalDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent data-testid="template-block-removal-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {m.event_templates_remove_blocks_title()}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {m.event_templates_remove_blocks_description()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {blocks.map((block) => (
            <li key={block.blockId}>
              {block.ministryCount === 1
                ? m.event_templates_remove_block_count_one({
                    label: block.label,
                  })
                : m.event_templates_remove_block_count_other({
                    label: block.label,
                    count: block.ministryCount,
                  })}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {m.event_templates_cancel()}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            data-testid="confirm-block-removal-button"
            onClick={onConfirm}
          >
            {m.event_templates_remove_blocks_confirm()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

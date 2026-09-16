import type { TimeOfDay } from '@church/time';
import type { TemplateBlockDraft } from './planning-admin.types';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LabelChangeInput {
  blockId: string;
  field: 'label';
  value: string;
}

interface TimeChangeInput {
  blockId: string;
  field: 'startTime' | 'endTime';
  value: TimeOfDay;
}

type BlockChangeInput = LabelChangeInput | TimeChangeInput;

interface RemoveBlockInput {
  blockId: string;
}

export interface TemplateBlockRowProps {
  block: TemplateBlockDraft;
  index: number;
  totalBlocks: number;
  onBlockChange: (input: BlockChangeInput) => void;
  onRemoveBlock: (input: RemoveBlockInput) => void;
}

export function TemplateBlockRow({
  block,
  index,
  totalBlocks,
  onBlockChange,
  onRemoveBlock,
}: TemplateBlockRowProps) {
  return (
    <div
      className="surface-subtle workspace-panel space-y-2"
      data-testid="template-block-row"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">Block {index + 1}</div>
        {totalBlocks > 1 ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onRemoveBlock({ blockId: block.id })}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label>Label</Label>
        <Input
          data-testid="template-block-label-input"
          value={block.label}
          onChange={(event) =>
            onBlockChange({
              blockId: block.id,
              field: 'label',
              value: event.target.value,
            })
          }
          placeholder="Welcome"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label id={`${block.id}-start-time-label`}>Start time</Label>
          <TimeOfDayField
            aria-labelledby={`${block.id}-start-time-label`}
            data-testid="template-block-start-time-input"
            value={block.startTime}
            onChange={(value) =>
              onBlockChange({
                blockId: block.id,
                field: 'startTime',
                value,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label id={`${block.id}-end-time-label`}>End time</Label>
          <TimeOfDayField
            aria-labelledby={`${block.id}-end-time-label`}
            data-testid="template-block-end-time-input"
            value={block.endTime}
            onChange={(value) =>
              onBlockChange({
                blockId: block.id,
                field: 'endTime',
                value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

import { Button } from '@church/ui/components/button';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import type { TemplateBlockDraft } from './planning-admin.types';

interface BlockChangeInput {
  blockId: string;
  field: 'label' | 'startTime' | 'endTime';
  value: string;
}

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
    <div className="space-y-2 border p-3" data-testid="template-block-row">
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
          <Label>Start time</Label>
          <Input
            data-testid="template-block-start-time-input"
            type="time"
            value={block.startTime}
            onChange={(event) =>
              onBlockChange({
                blockId: block.id,
                field: 'startTime',
                value: event.target.value,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label>End time</Label>
          <Input
            data-testid="template-block-end-time-input"
            type="time"
            value={block.endTime}
            onChange={(event) =>
              onBlockChange({
                blockId: block.id,
                field: 'endTime',
                value: event.target.value,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

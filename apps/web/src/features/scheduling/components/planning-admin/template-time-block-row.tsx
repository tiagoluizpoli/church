import { m } from '@church/i18n/messages';
import type { TimeOfDay } from '@church/time';
import type { TemplateTimeBlockDraft } from './planning-admin.types';
import { describeTemplateTimeBlockSpan } from './planning-admin.utils';
import { TimeBlockPlacePicker } from './time-block-place-picker';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

interface LabelChangeInput {
  blockKey: string;
  field: 'label';
  value: string;
}

interface TimeChangeInput {
  blockKey: string;
  field: 'startTime' | 'endTime';
  value: TimeOfDay;
}

interface PlaceChangeInput {
  blockKey: string;
  field: 'place';
  value: string;
}

interface PlaceAddressChangeInput {
  blockKey: string;
  field: 'placeAddressId';
  value: string | null;
}

interface PublicChangeInput {
  blockKey: string;
  field: 'isPublic';
  value: boolean;
}

type BlockChangeInput =
  | LabelChangeInput
  | TimeChangeInput
  | PlaceChangeInput
  | PlaceAddressChangeInput
  | PublicChangeInput;

interface RemoveBlockInput {
  blockKey: string;
}

export interface TemplateTimeBlockRowProps {
  block: TemplateTimeBlockDraft;
  index: number;
  totalBlocks: number;
  /** Inline refusal for this row's label (duplicate, from the server or client). */
  labelError?: string;
  /** Inline refusal for this row's times. */
  timeError?: string;
  onBlockChange: (input: BlockChangeInput) => void;
  onRemoveBlock: (input: RemoveBlockInput) => void;
}

export function TemplateTimeBlockRow({
  block,
  index,
  totalBlocks,
  labelError,
  timeError,
  onBlockChange,
  onRemoveBlock,
}: TemplateTimeBlockRowProps) {
  // Público and place are a ChurchAdmin decision (ADR 0009); leaders edit the rest.
  const { isChurchAdmin } = useCallerCapabilities();
  return (
    <div
      className="@container surface-subtle workspace-panel space-y-2"
      data-testid="template-time-block-row"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">
          {m.event_templates_block_title({ number: index + 1 })}
        </div>
        {totalBlocks > 1 ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onRemoveBlock({ blockKey: block.key })}
          >
            {m.event_templates_block_remove()}
          </Button>
        ) : null}
      </div>
      {/* One row per block on a wide surface (Nome · Início · Término · Local · Público), stacked when narrow. */}
      <div
        className={
          isChurchAdmin
            ? 'grid @3xl:grid-cols-[minmax(12rem,1fr)_8rem_8rem_minmax(10rem,14rem)_auto] gap-3 sm:grid-cols-2'
            : 'grid @3xl:grid-cols-[minmax(12rem,1fr)_8rem_8rem] gap-3 sm:grid-cols-2'
        }
      >
        <div className="@3xl:col-span-1 space-y-1 sm:col-span-2">
          <Label htmlFor={`${block.key}-label`}>
            {m.event_templates_block_label()}
          </Label>
          <Input
            id={`${block.key}-label`}
            aria-invalid={labelError ? true : undefined}
            aria-describedby={
              labelError ? `${block.key}-label-error` : undefined
            }
            data-testid="template-time-block-label-input"
            value={block.label}
            onChange={(event) =>
              onBlockChange({
                blockKey: block.key,
                field: 'label',
                value: event.target.value,
              })
            }
            placeholder={m.event_templates_block_label_placeholder()}
          />
          {labelError ? (
            <p
              id={`${block.key}-label-error`}
              className="text-destructive text-xs"
              data-testid="template-time-block-label-error"
            >
              {labelError}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          <Label id={`${block.key}-start-time-label`}>
            {m.event_templates_block_start()}
          </Label>
          <TimeOfDayField
            aria-labelledby={`${block.key}-start-time-label`}
            data-testid="template-time-block-start-time-input"
            value={block.startTime}
            onChange={(value) =>
              onBlockChange({
                blockKey: block.key,
                field: 'startTime',
                value,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label id={`${block.key}-end-time-label`}>
            {m.event_templates_block_end()}
          </Label>
          <TimeOfDayField
            aria-labelledby={`${block.key}-end-time-label`}
            data-testid="template-time-block-end-time-input"
            value={block.endTime}
            onChange={(value) =>
              onBlockChange({
                blockKey: block.key,
                field: 'endTime',
                value,
              })
            }
          />
        </div>
        {isChurchAdmin ? (
          <>
            <TimeBlockPlacePicker
              id={`${block.key}-place`}
              testIdPrefix="template-time-block"
              label={m.event_templates_block_place()}
              placeholder={m.event_templates_block_place_placeholder()}
              place={block.place}
              placeAddressId={block.placeAddressId}
              onChange={({ place, placeAddressId }) => {
                onBlockChange({
                  blockKey: block.key,
                  field: 'place',
                  value: place,
                });
                onBlockChange({
                  blockKey: block.key,
                  field: 'placeAddressId',
                  value: placeAddressId,
                });
              }}
            />
            <div
              className="space-y-1"
              data-testid="template-time-block-public-fields"
            >
              <Label id={`${block.key}-public-label`}>
                {m.event_templates_block_public()}
              </Label>
              <div className="flex min-h-8 items-center gap-2">
                <Switch
                  id={`${block.key}-public`}
                  aria-labelledby={`${block.key}-public-label`}
                  aria-describedby={`${block.key}-public-hint`}
                  data-testid="template-time-block-public-switch"
                  checked={block.isPublic}
                  onCheckedChange={(checked) =>
                    onBlockChange({
                      blockKey: block.key,
                      field: 'isPublic',
                      value: checked,
                    })
                  }
                />
                <span
                  id={`${block.key}-public-hint`}
                  className="text-muted-foreground text-xs"
                >
                  {m.event_templates_block_public_hint()}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
      {timeError ? (
        <p
          className="text-destructive text-xs"
          role="alert"
          data-testid="template-time-block-time-error"
        >
          {timeError}
        </p>
      ) : null}
      {block.startTime && block.endTime && block.startTime !== block.endTime ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="template-time-block-span"
        >
          {describeTemplateTimeBlockSpan({
            startTime: block.startTime,
            endTime: block.endTime,
          })}
        </p>
      ) : null}
    </div>
  );
}

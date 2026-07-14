import { useForm } from '@tanstack/react-form';
import { Trash2Icon } from 'lucide-react';
import z from 'zod';
import {
  type SplitFormState,
  validateManualSpans,
} from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GetCycleParticipation200EventsItemSlotsItem } from '@/infrastructure/api/churchAPI.schemas';
import { cn } from '@/lib/utils';

export interface ManualSplitEditorProps {
  slotIndex: number;
  slotId: string;
  slotView?: GetCycleParticipation200EventsItemSlotsItem;
  splitForm: SplitFormState;
  onSplitFormChange: (nextForm: SplitFormState) => void;
}

interface ManualSplitSchemaParams {
  slotView: GetCycleParticipation200EventsItemSlotsItem | undefined;
}

const manualSpanSchema = z.object({
  startTime: z.string(),
  endTime: z.string(),
  label: z.string(),
});

export function createManualSplitSchema({ slotView }: ManualSplitSchemaParams) {
  const schema = z.object({
    mode: z.enum(['equal', 'manual']),
    equalCount: z.string().regex(/^[1-9]\d*$/, 'Enter at least one shift.'),
    manualSpans: z.array(manualSpanSchema),
  });

  if (!slotView) return schema;

  return schema.superRefine((value, context) => {
    if (value.mode !== 'manual') return;
    const error = validateManualSpans({ slotView, spans: value.manualSpans });
    if (error) {
      context.addIssue({
        code: 'custom',
        message: error,
        path: ['manualSpans'],
      });
    }
  });
}

type ShiftModePreset = 'single' | 'equal' | 'manual';

/** "Single shift" isn't a distinct backend strategy — it's `equal-n` with
 * `n=1` (data-model.md's shift default). Exposing it as its own preset here
 * gives the leader an explicit way back to "no split" (spec Edge Cases /
 * T022) without adding a third `SplitFormState.mode` value that would leak
 * into the unchanged `validateManualSpans`/payload contract. */
function toShiftModePreset(splitForm: SplitFormState): ShiftModePreset {
  if (splitForm.mode === 'manual') return 'manual';
  return splitForm.equalCount === '1' ? 'single' : 'equal';
}

/** Self-contained shift-split form: mode toggle (single/equal/manual),
 * equal-count input, and manual span rows. Extracted from the old inline
 * definition in `participation-tailoring.tsx`; `validateManualSpans`/payload
 * logic is unchanged (research.md R2) — only this component's DOM is
 * rewritten to use shadcn `Select` in place of the native `<select>`. */
export function ManualSplitEditor({
  slotIndex,
  slotId,
  slotView,
  splitForm,
  onSplitFormChange,
}: ManualSplitEditorProps) {
  const isMobile = useFormControlSize() === 'touch';
  const form = useForm({
    defaultValues: splitForm,
    validators: { onChange: createManualSplitSchema({ slotView }) },
  });
  const modePreset = toShiftModePreset(splitForm);
  const updateSplitForm = (nextForm: SplitFormState) => {
    form.reset(nextForm);
    onSplitFormChange(nextForm);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`shift-mode-select-${slotId}`}>Shift split mode</Label>
        <Select
          value={modePreset}
          onValueChange={(value) => {
            if (value === 'single') {
              updateSplitForm({
                ...splitForm,
                mode: 'equal',
                equalCount: '1',
              });
              return;
            }
            if (value === 'manual') {
              updateSplitForm({ ...splitForm, mode: 'manual' });
              return;
            }
            updateSplitForm({
              ...splitForm,
              mode: 'equal',
              equalCount:
                splitForm.equalCount === '1' ? '2' : splitForm.equalCount,
            });
          }}
        >
          <SelectTrigger
            id={`shift-mode-select-${slotId}`}
            data-testid={`shift-mode-select-${slotIndex}`}
            className={cn(
              'w-full',
              isMobile && 'px-3 text-sm data-[size=default]:h-11',
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single shift</SelectItem>
            <SelectItem value="equal">Equal split</SelectItem>
            <SelectItem value="manual">Manual spans</SelectItem>
          </SelectContent>
        </Select>
        {modePreset === 'manual' ? (
          <p className="text-muted-foreground text-xs">
            Each span must stay within the slot's time range and can't overlap
            another span.
          </p>
        ) : null}
      </div>

      {modePreset === 'equal' ? (
        <div className="space-y-1">
          <Label htmlFor={`equal-count-${slotId}`}>Number of shifts</Label>
          <Input
            id={`equal-count-${slotId}`}
            data-testid={`equal-split-count-${slotIndex}`}
            type="number"
            min="2"
            value={splitForm.equalCount}
            onChange={(event) =>
              updateSplitForm({
                ...splitForm,
                equalCount: event.target.value,
              })
            }
          />
        </div>
      ) : modePreset === 'manual' ? (
        <div className="space-y-3">
          {splitForm.manualSpans.map((span, spanIndex) => (
            <div
              key={`${slotIndex}-${spanIndex}`}
              className="space-y-2"
              data-testid={`manual-split-row-${slotIndex}-${spanIndex}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  Span {spanIndex + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size={isMobile ? 'icon-touch' : 'icon-sm'}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove span ${spanIndex + 1}`}
                  data-testid={`remove-manual-split-${slotIndex}-${spanIndex}`}
                  onClick={() =>
                    updateSplitForm({
                      ...splitForm,
                      manualSpans: splitForm.manualSpans.filter(
                        (_currentSpan, currentIndex) =>
                          currentIndex !== spanIndex,
                      ),
                    })
                  }
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
              <div className="grid gap-2">
                <Input
                  data-testid={`manual-split-start-${slotIndex}-${spanIndex}`}
                  type="datetime-local"
                  aria-label="Shift start"
                  value={span.startTime}
                  onChange={(event) =>
                    updateSplitForm({
                      ...splitForm,
                      manualSpans: splitForm.manualSpans.map(
                        (currentSpan, currentIndex) =>
                          currentIndex === spanIndex
                            ? { ...currentSpan, startTime: event.target.value }
                            : currentSpan,
                      ),
                    })
                  }
                />
                <Input
                  data-testid={`manual-split-end-${slotIndex}-${spanIndex}`}
                  type="datetime-local"
                  aria-label="Shift end"
                  value={span.endTime}
                  onChange={(event) =>
                    updateSplitForm({
                      ...splitForm,
                      manualSpans: splitForm.manualSpans.map(
                        (currentSpan, currentIndex) =>
                          currentIndex === spanIndex
                            ? { ...currentSpan, endTime: event.target.value }
                            : currentSpan,
                      ),
                    })
                  }
                />
                <Input
                  data-testid={`manual-split-label-${slotIndex}-${spanIndex}`}
                  value={span.label}
                  placeholder="Shift label"
                  onChange={(event) =>
                    onSplitFormChange({
                      ...splitForm,
                      manualSpans: splitForm.manualSpans.map(
                        (currentSpan, currentIndex) =>
                          currentIndex === spanIndex
                            ? { ...currentSpan, label: event.target.value }
                            : currentSpan,
                      ),
                    })
                  }
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size={isMobile ? 'touch' : 'sm'}
            data-testid={`add-manual-split-${slotIndex}`}
            onClick={() =>
              updateSplitForm({
                ...splitForm,
                manualSpans: [
                  ...splitForm.manualSpans,
                  { startTime: '', endTime: '', label: '' },
                ],
              })
            }
          >
            Add manual span
          </Button>
        </div>
      ) : null}
    </div>
  );
}

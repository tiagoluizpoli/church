import type { SplitFormState } from '../participation-tailoring.utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ManualSplitEditorProps {
  slotIndex: number;
  slotId: string;
  splitForm: SplitFormState;
  onSplitFormChange: (nextForm: SplitFormState) => void;
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
  splitForm,
  onSplitFormChange,
}: ManualSplitEditorProps) {
  const modePreset = toShiftModePreset(splitForm);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor={`shift-mode-select-${slotId}`}>Shift split mode</Label>
        <Select
          value={modePreset}
          onValueChange={(value) => {
            if (value === 'single') {
              onSplitFormChange({
                ...splitForm,
                mode: 'equal',
                equalCount: '1',
              });
              return;
            }
            if (value === 'manual') {
              onSplitFormChange({ ...splitForm, mode: 'manual' });
              return;
            }
            onSplitFormChange({
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
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single shift</SelectItem>
            <SelectItem value="equal">Equal split</SelectItem>
            <SelectItem value="manual">Manual spans</SelectItem>
          </SelectContent>
        </Select>
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
              onSplitFormChange({
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
              className="grid gap-2"
              data-testid={`manual-split-row-${slotIndex}-${spanIndex}`}
            >
              <Input
                data-testid={`manual-split-start-${slotIndex}-${spanIndex}`}
                type="datetime-local"
                value={span.startTime}
                onChange={(event) =>
                  onSplitFormChange({
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
                value={span.endTime}
                onChange={(event) =>
                  onSplitFormChange({
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
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`add-manual-split-${slotIndex}`}
            onClick={() =>
              onSplitFormChange({
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

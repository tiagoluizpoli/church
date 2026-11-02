import { m } from '@church/i18n/messages';
import { timeOfDaySpan } from '@church/time';
import { Trash2Icon } from 'lucide-react';
import {
  changeShiftSplitMode,
  formatTimeRange,
  MAX_EQUAL_SHIFTS,
  type ManualSpanDraft,
  newSpanDraft,
  type ShiftSplitBlockBounds,
  type ShiftSplitDraft,
  type ShiftSplitMode,
  type ShiftSplitProblems,
  type SpanProblem,
} from './shift-split.utils';
import { TimeOfDayField } from '@/components/time-of-day-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { describeSpan } from '@/shared/utils/span-description';

export interface ShiftSplitEditorProps {
  draft: ShiftSplitDraft;
  /** The Time block's recurring bounds; a caller with Instants adapts them. */
  block: ShiftSplitBlockBounds;
  problems: ShiftSplitProblems;
  onChange: (draft: ShiftSplitDraft) => void;
  disabled?: boolean;
}

interface UpdateSpanInput {
  key: string;
  patch: Partial<ManualSpanDraft>;
}

interface ModeOption {
  mode: ShiftSplitMode;
  label: () => string;
}

const MODES: ModeOption[] = [
  { mode: 'whole', label: () => m.shift_split_mode_whole() },
  { mode: 'equal', label: () => m.shift_split_mode_equal() },
  { mode: 'manual', label: () => m.shift_split_mode_manual() },
];

interface SpanProblemTextInput {
  range: string;
}

const SPAN_PROBLEMS: Record<
  SpanProblem,
  (input: SpanProblemTextInput) => string
> = {
  incomplete: () => m.shift_split_span_incomplete(),
  zeroDuration: () => m.shift_split_span_zero_duration(),
  outsideBlock: ({ range }) => m.shift_split_span_outside_block({ range }),
  overlap: () => m.shift_split_span_overlap(),
};

/**
 * Whole block, N equal Shifts or manual Shifts for one recurring Time block.
 * Purely a controlled draft editor: the caller owns Save and persistence.
 */
export function ShiftSplitEditor({
  draft,
  block,
  problems,
  onChange,
  disabled = false,
}: ShiftSplitEditorProps) {
  const update = (patch: Partial<ShiftSplitDraft>) =>
    onChange({ ...draft, ...patch });
  const updateSpan = ({ key, patch }: UpdateSpanInput) =>
    update({
      spans: draft.spans.map((span) =>
        span.key === key ? { ...span, ...patch } : span,
      ),
    });
  const blockRange = formatTimeRange(block);

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="font-medium text-sm">{m.shift_split_legend()}</legend>
      <RadioGroup
        value={draft.mode}
        onValueChange={(mode) =>
          onChange(
            changeShiftSplitMode({
              draft,
              mode: mode as ShiftSplitMode,
              block,
            }),
          )
        }
      >
        {MODES.map(({ mode, label }) => (
          <div key={mode} className="flex items-center gap-2">
            <RadioGroupItem value={mode} id={`shift-split-mode-${mode}`} />
            <Label htmlFor={`shift-split-mode-${mode}`}>{label()}</Label>
          </div>
        ))}
      </RadioGroup>

      {draft.mode === 'equal' ? (
        <div className="space-y-1">
          <Label htmlFor="shift-split-equal-count">
            {m.shift_split_equal_count()}
          </Label>
          <Input
            id="shift-split-equal-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EQUAL_SHIFTS}
            className="max-w-32"
            value={draft.equalCount}
            aria-invalid={problems.count ? true : undefined}
            aria-describedby="shift-split-equal-help"
            onChange={(event) => update({ equalCount: event.target.value })}
          />
          <p
            id="shift-split-equal-help"
            className={
              problems.count
                ? 'text-destructive text-xs'
                : 'text-muted-foreground text-xs'
            }
          >
            {problems.count
              ? m.shift_split_count_invalid({ max: MAX_EQUAL_SHIFTS })
              : m.shift_split_equal_help()}
          </p>
        </div>
      ) : null}

      {draft.mode === 'manual' ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs">
            {m.shift_split_manual_help({ range: blockRange })}
          </p>
          {draft.spans.map((span, index) => {
            const number = index + 1;
            const problem = problems.spans[index];
            const length =
              span.startTime && span.endTime
                ? timeOfDaySpan({ start: span.startTime, end: span.endTime })
                : null;
            return (
              <fieldset key={span.key} className="surface-panel space-y-2 p-3">
                <legend className="px-1 font-medium text-sm">
                  {m.usual_setup_shift_label({ number })}
                </legend>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={m.shift_split_remove({ number })}
                    onClick={() =>
                      update({
                        spans: draft.spans.filter(
                          (candidate) => candidate.key !== span.key,
                        ),
                      })
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs">{m.shift_split_start()}</p>
                    <TimeOfDayField
                      aria-label={m.shift_split_start_of({ number })}
                      data-testid={`shift-split-start-${number}`}
                      value={span.startTime}
                      onChange={(startTime) =>
                        updateSpan({ key: span.key, patch: { startTime } })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs">{m.shift_split_end()}</p>
                    <TimeOfDayField
                      aria-label={m.shift_split_end_of({ number })}
                      data-testid={`shift-split-end-${number}`}
                      value={span.endTime}
                      onChange={(endTime) =>
                        updateSpan({ key: span.key, patch: { endTime } })
                      }
                    />
                  </div>
                </div>
                {length && length.durationMinutes > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {describeSpan({ span: length })}
                  </p>
                ) : null}
                <Input
                  value={span.label}
                  placeholder={m.shift_split_label_placeholder()}
                  aria-label={m.shift_split_label_of({ number })}
                  onChange={(event) =>
                    updateSpan({
                      key: span.key,
                      patch: { label: event.target.value },
                    })
                  }
                />
                {problem ? (
                  <p className="text-destructive text-xs" role="alert">
                    {SPAN_PROBLEMS[problem]({ range: blockRange })}
                  </p>
                ) : null}
              </fieldset>
            );
          })}
          {problems.noSpans ? (
            <p className="text-destructive text-xs" role="alert">
              {m.shift_split_no_spans()}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const lastEnd = [...draft.spans]
                .reverse()
                .find((span) => span.endTime)?.endTime;
              const startTime = lastEnd ?? block.startTime;
              update({
                spans: [
                  ...draft.spans,
                  newSpanDraft({
                    startTime,
                    endTime: startTime === block.endTime ? null : block.endTime,
                  }),
                ],
              });
            }}
          >
            {m.shift_split_add()}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

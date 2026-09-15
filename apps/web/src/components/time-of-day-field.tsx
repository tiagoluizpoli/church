import { parseTimeOfDay, type TimeOfDay } from '@church/time';
import { parseTime } from '@internationalized/date';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TimeField, TimeInput } from '@/components/ui/time-field';
import { cn } from '@/lib/utils';

// Direction chosen on #133 ("Segmented field plus quick list"), against the
// map at #126. Ported from the retained prototype at
// `routes/prototype/time-entry.tsx` (see its NOTES.md) — this file lifts
// `SegmentedWithListControl`, `readSegments` and `optionsFor`, retyped to
// emit the seam's branded `TimeOfDay` rather than a bare string.
//
// Locked decisions baked in:
//   - 24h always, never locale-derived (#132)
//   - arbitrary minutes stay enterable; 00/15/30/45 is a fast path, not a rule
//   - no timezone indicator — Church Timezone is implied (#129)

const QUARTER_STEP = 15;

interface PadInput {
  value: number;
}

function pad({ value }: PadInput): string {
  return String(value).padStart(2, '0');
}

interface ToHHmmInput {
  hour: number;
  minute: number;
}

function toHHmm({ hour, minute }: ToHHmmInput): string {
  return `${pad({ value: hour })}:${pad({ value: minute })}`;
}

/** Every 15-minute TimeOfDay in a day — the fast path, not the only path. */
const QUARTER_OPTIONS: TimeOfDay[] = Array.from({ length: 96 }, (_, index) => {
  const total = index * QUARTER_STEP;
  return parseTimeOfDay({
    value: toHHmm({ hour: Math.floor(total / 60), minute: total % 60 }),
  });
});

interface MinutesOfInput {
  value: TimeOfDay;
}

/** Minutes from midnight, for the "scroll to the current value" placement. */
function minutesOf({ value }: MinutesOfInput): number {
  const [hour, minute] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

interface NearestQuarterValueInput {
  value: TimeOfDay | null;
}

/** The row a freshly-opened list should already be scrolled to — the nearest
 * quarter-hour to the held value, so an off-grid `18:21` still lands
 * somewhere sensible. Defaults near the middle of the working day when the
 * field is empty, rather than at `00:00`. Returns the *value*, not a
 * position — the list currently on screen may be filtered by segment, so a
 * global array index would point at the wrong row (or none at all). */
function nearestQuarterValue({ value }: NearestQuarterValueInput): TimeOfDay {
  const minutes = value ? minutesOf({ value }) : 9 * 60;
  const index = Math.round(minutes / QUARTER_STEP) % QUARTER_OPTIONS.length;
  return QUARTER_OPTIONS[index] as TimeOfDay;
}

/** What the two segments currently hold, and which one the caret is in. Read
 * from the DOM rather than tracked in parallel state: React Aria owns the
 * segments, only emits a value once *both* are filled, and is the authority on
 * where the caret went after a digit completed one. */
interface SegmentReading {
  hour: number | null;
  minute: number | null;
  focused: 'hour' | 'minute' | null;
}

interface ReadSegmentsInput {
  root: HTMLElement | null;
}

function readSegments({ root }: ReadSegmentsInput): SegmentReading {
  const reading: SegmentReading = { hour: null, minute: null, focused: null };
  for (const segment of root?.querySelectorAll('[role="spinbutton"]') ?? []) {
    const type = segment.getAttribute('data-type');
    const raw = segment.getAttribute('aria-valuenow');
    const parsed = raw === null || raw === '' ? null : Number(raw);
    if (type === 'hour') {
      reading.hour = parsed;
    }
    if (type === 'minute') {
      reading.minute = parsed;
    }
    if (
      segment === document.activeElement &&
      (type === 'hour' || type === 'minute')
    ) {
      reading.focused = type;
    }
  }
  return reading;
}

/** Which quarter-hours are still reachable, given where the caret is and what
 * has been typed into *that* segment since it took focus.
 *
 * In the **minute**, the hour is already settled, so the list never leaves it:
 * `10` then a `1` means `10:15`, and a `3` means `10:30`. In the **hour**, a
 * single digit is ambiguous the way the segment itself treats it — `1` may
 * still become `01` or any of `10`-`19` — so all of those stay,
 * chronologically. A second digit settles it. */
interface OptionsForInput {
  reading: SegmentReading;
  digits: string;
}

function optionsFor({ reading, digits }: OptionsForInput): TimeOfDay[] {
  const { hour, focused } = reading;

  if (focused === 'minute' && hour !== null) {
    const withinHour = QUARTER_OPTIONS.filter((option) =>
      option.startsWith(`${pad({ value: hour })}:`),
    );
    return digits === ''
      ? withinHour
      : withinHour.filter((option) => option.slice(3).startsWith(digits));
  }

  if (digits === '') {
    return hour === null
      ? QUARTER_OPTIONS
      : QUARTER_OPTIONS.filter((option) =>
          option.startsWith(`${pad({ value: hour })}:`),
        );
  }

  if (digits.length === 1) {
    const reachable = new Set<string>([pad({ value: Number(digits) })]);
    for (let candidate = 0; candidate <= 23; candidate += 1) {
      if (pad({ value: candidate }).startsWith(digits)) {
        reachable.add(pad({ value: candidate }));
      }
    }
    return QUARTER_OPTIONS.filter((option) =>
      reachable.has(option.slice(0, 2)),
    );
  }

  return QUARTER_OPTIONS.filter((option) => option.startsWith(`${digits}:`));
}

export interface TimeOfDayFieldProps {
  id?: string;
  value: TimeOfDay | null;
  onChange: (value: TimeOfDay) => void;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'data-testid'?: string;
}

/** The 24h time-of-day control: React Aria segments (typed or arrowed) plus a
 * chevron opening a 15-minute quick list. Both read and write a `TimeOfDay`.
 *
 * The list behaves like a combobox, not a popup: it opens on its own when the
 * field is empty or as soon as a digit is typed, narrows to what is still
 * reachable *in the segment being typed*, and Up/Down walk it without moving
 * the caret out of the segments. Escape closes it and hands the arrow keys
 * back to the segments, where they step the number as usual. Rendered inline
 * rather than in a popover on purpose — a popover would move focus into
 * itself on open, which must not happen while the field is still being typed
 * into. */
export function TimeOfDayField({
  id,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  'data-testid': dataTestId,
}: TimeOfDayFieldProps) {
  const [open, setOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [reading, setReading] = useState<SegmentReading>({
    hour: null,
    minute: null,
    focused: null,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const optionId = (option: TimeOfDay) => `${instanceId}-option-${option}`;

  // React Aria updates the segments *after* the keystroke it is handling, so
  // the DOM is only authoritative a frame later.
  const syncFromSegments = () => {
    requestAnimationFrame(() =>
      setReading(readSegments({ root: rootRef.current })),
    );
  };

  const options = optionsFor({ reading, digits });
  const active = Math.min(activeIndex, Math.max(0, options.length - 1));
  const nearest = nearestQuarterValue({ value });

  // React Aria's `DateSegment` doesn't accept `aria-activedescendant` as a
  // prop — it fully owns its own ARIA attributes as a spinbutton — so the
  // acceptance criterion ("options non-focusable under
  // aria-activedescendant") is met by setting it on the DOM node directly,
  // on whichever segment currently has real focus. React never touches this
  // attribute itself (it isn't part of what `DateSegment` renders), so it
  // survives re-renders until this effect next runs.
  useEffect(() => {
    const activeId = open && options[active] ? optionId(options[active]) : null;
    for (const segment of rootRef.current?.querySelectorAll<HTMLElement>(
      '[role="spinbutton"]',
    ) ?? []) {
      if (segment === document.activeElement && activeId) {
        segment.setAttribute('aria-activedescendant', activeId);
      } else {
        segment.removeAttribute('aria-activedescendant');
      }
    }
  });

  // The list must open where the value already is, not at the top. Effect
  // rather than inline scroll: the rows don't exist in the DOM until `open`
  // flips true and this renders them.
  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('[data-nearest="true"]')
        ?.scrollIntoView?.({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const moveTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), options.length - 1);
    setActiveIndex(clamped);
    listRef.current
      ?.querySelector(`[data-index="${clamped}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  };

  const close = () => {
    setOpen(false);
    setDigits('');
  };

  const commit = (picked: TimeOfDay | undefined) => {
    if (picked) {
      onChange(picked);
    }
    close();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      data-testid={dataTestId}
      // A digit that completes the hour moves the caret to the minute, and the
      // count of digits typed has to restart with it — otherwise the minute
      // inherits the hour's keystrokes.
      onFocusCapture={() => {
        setActiveIndex(0);
        syncFromSegments();
        if (!value) {
          setOpen(true);
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          close();
        }
      }}
      // Capture phase: React Aria's segments handle Up/Down themselves, so the
      // list has to claim those keys *before* they reach the segment — but only
      // while it is open. Closed, they fall through and step the number.
      onKeyDownCapture={(event) => {
        if (open) {
          const hourStep = Math.round(60 / QUARTER_STEP);
          const openListActions: Record<string, () => void> = {
            ArrowDown: () => moveTo(active + 1),
            ArrowUp: () => moveTo(active - 1),
            PageDown: () => moveTo(active + hourStep),
            PageUp: () => moveTo(active - hourStep),
            Home: () => moveTo(0),
            End: () => moveTo(options.length - 1),
            Enter: () => commit(options[active]),
            Escape: close,
          };
          const action = openListActions[event.key];
          if (action) {
            event.preventDefault();
            event.stopPropagation();
            action();
            return;
          }
        }
        // Tab means "done here" even though it lands on the chevron, which is
        // still inside this wrapper and so never triggers the blur handler.
        if (event.key === 'Tab') {
          close();
          return;
        }
        if (/^[0-9]$/.test(event.key)) {
          setActiveIndex(0);
          setOpen(true);
          syncFromSegments();
          return;
        }
        if (event.key === 'Backspace' || event.key === 'Delete') {
          setActiveIndex(0);
          syncFromSegments();
        }
      }}
    >
      <TimeField
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        id={id}
        hourCycle={24}
        shouldForceLeadingZeros
        granularity="minute"
        isDisabled={disabled}
        value={value ? parseTime(value) : null}
        onChange={(next) =>
          next &&
          onChange(
            parseTimeOfDay({
              value: toHHmm({ hour: next.hour, minute: next.minute }),
            }),
          )
        }
      >
        <TimeInput
          pendingDigits={digits}
          onPendingDigitsChange={(next) => {
            setDigits(next);
            syncFromSegments();
          }}
          trailing={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Pick a common time"
              aria-expanded={open}
              // Out of the tab order on purpose: it is a mouse affordance, and
              // everything it offers is already reachable by typing. Leaving it
              // tabbable only means Tab out of the minute lands *inside* the
              // control just finished, rather than on the next field.
              tabIndex={-1}
              className="absolute top-1/2 right-1 -translate-y-1/2"
              // Keep the caret in the segments — a plain click would blur them.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if (open) {
                  close();
                  return;
                }
                setDigits('');
                setActiveIndex(0);
                setReading(readSegments({ root: rootRef.current }));
                setOpen(true);
              }}
            >
              <ChevronDown className="opacity-60" />
            </Button>
          }
        />
      </TimeField>
      {open && options.length > 0 ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Common times"
          className="radius-control absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-auto border border-border bg-popover p-1 shadow-md"
        >
          {options.map((option, index) => (
            // Never in the tab order — focus stays on the segments throughout.
            // The segment reports the highlighted row via
            // `aria-activedescendant` (its `id` below) rather than this row
            // taking focus. A real `Button` (rather than a bare `div`) still
            // gives it native keyboard semantics, matching the `role="option"`
            // pattern already used for `cycle-list-card.tsx`'s option rows.
            <Button
              key={option}
              id={optionId(option)}
              type="button"
              variant="ghost"
              tabIndex={-1}
              role="option"
              data-index={index}
              data-nearest={option === nearest}
              aria-selected={option === value}
              className={cn(
                'h-auto w-full justify-start rounded px-2 py-1.5 text-left text-sm tabular-nums',
                index === active && 'bg-accent',
                option === value && 'font-medium',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

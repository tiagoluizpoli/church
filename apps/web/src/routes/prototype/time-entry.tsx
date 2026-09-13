import { parseTime } from '@internationalized/date';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { DatePickerField } from '@/components/date-picker-field';
import { PrototypeSwitcher } from '@/components/prototype-switcher';
import { Button } from '@/components/ui/button';
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimeField, TimeInput } from '@/components/ui/time-field';
import { cn } from '@/lib/utils';

// THROWAWAY PROTOTYPE — answers issue #133, "Pick the time-entry direction".
// Four takes on the TimeOfDay control that replaces the nine native
// <input type="time"> / <input type="datetime-local"> boxes in scheduling.
// Nothing here is production code. Run from the repo root:
//   bun run dev:web   ->  http://localhost:3001/prototype/time-entry
//
// Decisions already locked on the map (#126), baked into every variant:
//   - 24h always. Never locale-derived. (#132)
//   - Arbitrary minutes must stay enterable; 00/15/30/45 is the fast path.
//   - No timezone indicator anywhere — church time is implied. (#129)
//   - Day + time is two boxes, reusing the audited DatePickerField. (#128)
//   - One control serves authoring AND the tailoring filter.

const VARIANTS = [
  { key: 'A', label: 'Segmented field' },
  { key: 'B', label: 'Segmented + quick list' },
  { key: 'C', label: 'Type-ahead' },
  { key: 'D', label: 'Touch stepper' },
];

const SCENARIOS = [
  { key: 'blocks', label: 'Template blocks' },
  { key: 'slot', label: 'Slot bounds' },
  { key: 'overnight', label: 'Overnight shift' },
  { key: 'filter', label: 'Tailoring filter' },
];

type VariantKey = 'A' | 'B' | 'C' | 'D';
type ScenarioKey = 'blocks' | 'slot' | 'overnight' | 'filter';

interface TimeEntryPrototypeSearch {
  variant: VariantKey;
}

function parseVariant(value: unknown): VariantKey {
  return value === 'B' || value === 'C' || value === 'D' ? value : 'A';
}

export const Route = createFileRoute('/prototype/time-entry')({
  validateSearch: (search): TimeEntryPrototypeSearch => ({
    variant: parseVariant(search.variant),
  }),
  component: TimeEntryPrototype,
});

/* ------------------------------------------------------------------ */
/* TimeOfDay helpers — a TimeOfDay is an 'HH:mm' string, as it is today */
/* ------------------------------------------------------------------ */

const QUARTER_STEP = 15;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toHHmm(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

function isValidHHmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function partsOf(value: string): { hour: number; minute: number } | null {
  if (!isValidHHmm(value)) {
    return null;
  }
  const [hour, minute] = value.split(':');
  return { hour: Number(hour), minute: Number(minute) };
}

/** Every 15-minute TimeOfDay in a day — the fast path, not the only path. */
const QUARTER_OPTIONS: string[] = Array.from({ length: 96 }, (_, index) => {
  const total = index * QUARTER_STEP;
  return toHHmm(Math.floor(total / 60), total % 60);
});

/** Accepts what a leader in a hurry actually types: `1821`, `18:21`, `6:21pm`,
 * `6pm`, `6`, `6.21`. Returns null when it cannot be read as a TimeOfDay.
 * Deliberately forgiving — the locked decision is that odd minutes stay
 * enterable, so the parser must not fight someone typing 18:21. */
function parseLooseTime(raw: string): string | null {
  const input = raw.trim().toLowerCase();
  if (input === '') {
    return null;
  }

  const meridiem = input.endsWith('pm')
    ? 'pm'
    : input.endsWith('am')
      ? 'am'
      : null;
  const body = meridiem ? input.slice(0, -2).trim() : input;
  const digits = body.replace(/[^\d]/g, '');
  if (digits === '') {
    return null;
  }

  let hour: number;
  let minute: number;

  if (/[:.h]/.test(body)) {
    const [rawHour, rawMinute = '0'] = body.split(/[:.h]/);
    hour = Number(rawHour);
    minute = Number(rawMinute.padEnd(2, '0'));
  } else if (digits.length <= 2) {
    hour = Number(digits);
    minute = 0;
  } else {
    hour = Number(digits.slice(0, digits.length - 2));
    minute = Number(digits.slice(-2));
  }

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  if (meridiem === 'pm' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'am' && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  return toHHmm(hour, minute);
}

/** Minutes from midnight, for span arithmetic only. */
function minutesOf(value: string): number | null {
  const parts = partsOf(value);
  return parts ? parts.hour * 60 + parts.minute : null;
}

/** Centre the marked row inside its own scroll container. `scrollIntoView`
 * is wrong here: inside a freshly-portalled popover it either no-ops or
 * scrolls an ancestor, so a 96-row list opens at 00:00 instead of at 09:00. */
function centreNearestRow(container: HTMLDivElement | null): void {
  const target = container?.querySelector<HTMLElement>('[data-nearest="true"]');
  if (!container || !target) {
    return;
  }
  // The list must open at the value you already hold, not at 00:00. Four
  // traps stand in the way, and the last one is why this is a retry loop
  // rather than a single call:
  //  - offsetTop resolves against the nearest *positioned* ancestor, which in
  //    a portalled popover is the popup, not this scroll container. Hence rects.
  //  - the popup animates in (duration-100), so early frames measure at 0.
  //  - base-ui mounts popup content once to measure and again to show it, so a
  //    mount effect can fire on a node that never becomes visible. Hence the
  //    ref callback and the isConnected check.
  //  - base-ui resets scrollTop once the open animation settles, silently
  //    undoing a scroll that verifiably applied. So re-apply until it sticks.
  let attempts = 0;
  const attempt = () => {
    attempts += 1;
    if (!container.isConnected || attempts > 8) {
      return;
    }
    if (container.clientHeight > 0) {
      const desired =
        container.scrollTop +
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        (container.clientHeight - target.clientHeight) / 2;
      container.scrollTop = desired;
      if (Math.abs(container.scrollTop - desired) < 2 && attempts > 3) {
        return;
      }
    }
    setTimeout(attempt, 60);
  };
  requestAnimationFrame(attempt);
}

/** The list row to scroll to when a list opens — an off-grid 18:21 still has
 * somewhere sensible to land. */
function nearestQuarter(value: string): string {
  const current = minutesOf(value) ?? 9 * 60;
  const index = Math.round(current / QUARTER_STEP) % QUARTER_OPTIONS.length;
  return QUARTER_OPTIONS[index] ?? QUARTER_OPTIONS[0];
}

/** The computed-span confirmation #128 requires: with the `start < end` check
 * gone, an end before its start means the block runs onto the next
 * CalendarDay, and the form has to say so rather than reject it. */
function describeSpan(start: string, end: string): string | null {
  const from = minutesOf(start);
  const to = minutesOf(end);
  if (from === null || to === null) {
    return null;
  }
  const crossesMidnight = to <= from;
  const total = crossesMidnight ? to + 24 * 60 - from : to - from;
  if (total === 0) {
    return 'Zero length — start and end are the same.';
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const duration = [
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return crossesMidnight ? `${duration} · ends next day` : duration;
}

/* ------------------------------------------------------------------ */
/* The four candidate controls — identical props, so scenarios are shared */
/* ------------------------------------------------------------------ */

interface TimeControlProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/** A — React Aria `TimeField`. Hour and minute are separate spinbuttons:
 * type over them, or arrow up/down. No popup, no list, nothing to scroll.
 * Already a direct dependency; `hourCycle={24}` is the whole 24h fix. */
function SegmentedTimeControl({
  id,
  value,
  onChange,
  trailing,
  pendingDigits,
  onPendingDigitsChange,
}: TimeControlProps & {
  trailing?: ReactNode;
  pendingDigits?: string;
  onPendingDigitsChange?: (digits: string) => void;
}) {
  const parts = partsOf(value);

  return (
    <TimeField
      aria-labelledby={`${id}-label`}
      hourCycle={24}
      shouldForceLeadingZeros
      granularity="minute"
      value={parts ? parseTime(value) : null}
      onChange={(next) => onChange(next ? toHHmm(next.hour, next.minute) : '')}
    >
      <TimeInput
        trailing={trailing}
        pendingDigits={pendingDigits}
        onPendingDigitsChange={onPendingDigitsChange}
      />
    </TimeField>
  );
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

function readSegments(root: HTMLElement | null): SegmentReading {
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
 * `10` then a `1` means `10:15`, and a `3` means `10:30`. The previous version
 * filtered on a flat digit buffer with no idea which segment a digit landed
 * in, so typing `11` then `04` searched `04` as if it were an *hour*.
 *
 * In the **hour**, a single digit is ambiguous the way the segment itself
 * treats it — `1` may still become `01` or any of `10`-`19` — so all of those
 * stay, chronologically. A second digit settles it. */
function optionsFor(reading: SegmentReading, digits: string): string[] {
  const { hour, focused } = reading;

  if (focused === 'minute' && hour !== null) {
    const withinHour = QUARTER_OPTIONS.filter((option) =>
      option.startsWith(`${pad(hour)}:`),
    );
    return digits === ''
      ? withinHour
      : withinHour.filter((option) => option.slice(3).startsWith(digits));
  }

  if (digits === '') {
    return hour === null
      ? QUARTER_OPTIONS
      : QUARTER_OPTIONS.filter((option) => option.startsWith(`${pad(hour)}:`));
  }

  if (digits.length === 1) {
    const reachable = new Set<string>([pad(Number(digits))]);
    for (let candidate = 0; candidate <= 23; candidate += 1) {
      if (pad(candidate).startsWith(digits)) {
        reachable.add(pad(candidate));
      }
    }
    return QUARTER_OPTIONS.filter((option) =>
      reachable.has(option.slice(0, 2)),
    );
  }

  return QUARTER_OPTIONS.filter((option) => option.startsWith(`${digits}:`));
}

/** B — A, plus a list that behaves like a combobox rather than a popup.
 *
 * Focus never leaves the segments. The list opens on its own when the field is
 * empty or as soon as a digit is typed, narrows to what is still reachable
 * *in the segment being typed*, and Up/Down walk it without moving the caret —
 * so a leader can type `10`, see the hour's four quarters, and press Enter.
 * Escape closes the list and hands the arrow keys straight back to the
 * segments, where they step the number the way they always did.
 *
 * The list is rendered inline rather than in a Popover on purpose: base-ui
 * moves focus into the popup on open, which is exactly what must not happen
 * while the field is still being typed into. */
function SegmentedWithListControl({ id, value, onChange }: TimeControlProps) {
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

  // React Aria updates the segments *after* the keystroke it is handling, so
  // the DOM is only authoritative a frame later.
  const syncFromSegments = () => {
    requestAnimationFrame(() => setReading(readSegments(rootRef.current)));
  };

  const options = optionsFor(reading, digits);
  const active = Math.min(activeIndex, Math.max(0, options.length - 1));

  const moveTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), options.length - 1);
    setActiveIndex(clamped);
    listRef.current
      ?.querySelector(`[data-index="${clamped}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const close = () => {
    setOpen(false);
    setDigits('');
  };

  const commit = (picked: string | undefined) => {
    if (picked) {
      onChange(picked);
    }
    close();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      // A digit that completes the hour moves the caret to the minute, and the
      // count of digits typed has to restart with it — otherwise the minute
      // inherits the hour's keystrokes, which is the bug this replaces.
      onFocusCapture={() => {
        setActiveIndex(0);
        syncFromSegments();
        if (value === '') {
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
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            event.stopPropagation();
            moveTo(active + 1);
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            moveTo(active - 1);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commit(options[active]);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
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
      <SegmentedTimeControl
        id={id}
        value={value}
        onChange={onChange}
        // Driven from here rather than left inside the field: picking a row
        // has to wipe them, or the field goes on rendering `11:1-` after the
        // value has already become 11:15.
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
              setReading(readSegments(rootRef.current));
              setOpen(true);
            }}
          >
            <ChevronDown className="opacity-60" />
          </Button>
        }
      />
      {open && options.length > 0 ? (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Common times"
          className="radius-control absolute top-full right-0 left-0 z-50 mt-1 max-h-56 overflow-auto border border-border bg-popover p-1 shadow-md"
        >
          {options.map((option, index) => (
            // Focus stays on the segments throughout, so these rows are never
            // focusable and never carry their own key handler.
            // biome-ignore lint/a11y/useFocusableInteractive: see above
            // biome-ignore lint/a11y/useKeyWithClickEvents: see above
            <div
              key={option}
              role="option"
              aria-selected={option === value}
              data-index={index}
              data-nearest={index === 0}
              className={cn(
                'cursor-pointer rounded px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent',
                index === active && 'bg-accent',
                option === value && 'font-medium',
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => commit(option)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {option}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** C — one text box. Typing filters the 15-minute list; anything the parser
 * can read is accepted on blur, so `621pm` lands on 18:21 without the list. */
function TypeAheadTimeControl({ id, value, onChange }: TimeControlProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  // Focusing a field that already holds 09:00 must not filter the list down to
  // the single row "09:00" — until the leader actually types, the list is the
  // whole day, scrolled to where they are.
  const [typed, setTyped] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const digits = draft.replace(/[^\d]/g, '');
  const suggestions =
    typed && digits !== ''
      ? QUARTER_OPTIONS.filter((option) =>
          option.replace(':', '').startsWith(digits),
        ).slice(0, 60)
      : QUARTER_OPTIONS;
  const parsed = parseLooseTime(draft);
  const nearest = nearestQuarter(value);

  const commit = () => {
    onChange(parsed ?? '');
    setDraft(parsed ?? '');
    setOpen(false);
    setTyped(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        className="tabular-nums"
        value={draft}
        onFocus={() => {
          setTyped(false);
          setOpen(true);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            setDraft(value);
            setOpen(false);
          }
        }}
      />
      {open && suggestions.length > 0 ? (
        <div className="absolute top-full left-0 z-50 mt-1 w-full">
          {/* Ref callback, not an effect: it fires when the list actually
              attaches on open, and not again while typing filters the rows. */}
          <div
            ref={typed ? null : centreNearestRow}
            className="radius-control max-h-56 overflow-auto border border-border bg-popover p-1 shadow-md"
          >
            {suggestions.map((option) => (
              <button
                key={option}
                type="button"
                data-nearest={option === nearest}
                className={cn(
                  'block w-full rounded px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent',
                  option === value && 'bg-accent font-medium',
                )}
                // onMouseDown, not onClick — the input's onBlur would
                // otherwise commit and close the list before the click lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                  setDraft(option);
                  setOpen(false);
                  setTyped(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {parsed && parsed !== draft ? (
        <p className="mt-1 text-muted-foreground text-xs">Reads as {parsed}</p>
      ) : null}
    </div>
  );
}

/** D — no typing at all. Hour and minute as large steppers, minute moving in
 * 15s until "Fine steps" drops it to 1. The maximum-target-size extreme. */
function TouchStepperControl({ id, value, onChange }: TimeControlProps) {
  const [fine, setFine] = useState(false);
  const parts = partsOf(value) ?? { hour: 9, minute: 0 };

  const step = (unit: 'hour' | 'minute', direction: 1 | -1) => {
    if (unit === 'hour') {
      onChange(toHHmm((parts.hour + direction + 24) % 24, parts.minute));
      return;
    }
    if (fine) {
      const total = (parts.hour * 60 + parts.minute + direction + 1440) % 1440;
      onChange(toHHmm(Math.floor(total / 60), total % 60));
      return;
    }
    // Coarse mode snaps onto the 15-minute grid rather than adding 15 to an
    // off-grid value, so 18:21 + one press is 18:30, not 18:36.
    const current = parts.hour * 60 + parts.minute;
    const snapped =
      direction === 1
        ? (Math.floor(current / QUARTER_STEP) + 1) * QUARTER_STEP
        : (Math.ceil(current / QUARTER_STEP) - 1) * QUARTER_STEP;
    const total = (snapped + 1440) % 1440;
    onChange(toHHmm(Math.floor(total / 60), total % 60));
  };

  return (
    <div className="space-y-2" id={id}>
      <div className="flex items-center gap-2">
        <StepperColumn
          unit="Hour"
          display={pad(parts.hour)}
          onStep={(direction) => step('hour', direction)}
        />
        <span className="pt-5 font-semibold text-2xl text-muted-foreground">
          :
        </span>
        <StepperColumn
          unit="Minute"
          display={pad(parts.minute)}
          onStep={(direction) => step('minute', direction)}
        />
      </div>
      <Button
        type="button"
        size="xs"
        variant={fine ? 'secondary' : 'ghost'}
        onClick={() => setFine((previous) => !previous)}
      >
        {fine ? 'Fine steps: 1 min' : 'Fine steps: off'}
      </Button>
    </div>
  );
}

interface StepperColumnProps {
  unit: string;
  display: string;
  onStep: (direction: 1 | -1) => void;
}

function StepperColumn({ unit, display, onStep }: StepperColumnProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-xs">{unit}</span>
      <Button
        type="button"
        variant="outline"
        aria-label={`Increase ${unit.toLowerCase()}`}
        className="h-11 w-16"
        onClick={() => onStep(1)}
      >
        <Plus />
      </Button>
      <span className="w-16 text-center font-semibold text-2xl tabular-nums">
        {display}
      </span>
      <Button
        type="button"
        variant="outline"
        aria-label={`Decrease ${unit.toLowerCase()}`}
        className="h-11 w-16"
        onClick={() => onStep(-1)}
      >
        <Minus />
      </Button>
    </div>
  );
}

const CONTROLS: Record<VariantKey, (props: TimeControlProps) => ReactNode> = {
  A: SegmentedTimeControl,
  B: SegmentedWithListControl,
  C: TypeAheadTimeControl,
  D: TouchStepperControl,
};

interface LabelledTimeFieldProps extends TimeControlProps {
  label: string;
  variant: VariantKey;
}

function LabelledTimeField({
  label,
  variant,
  ...props
}: LabelledTimeFieldProps) {
  const Control = CONTROLS[variant];
  return (
    <div className="space-y-1">
      <Label id={`${props.id}-label`} htmlFor={props.id}>
        {label}
      </Label>
      <Control {...props} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scenarios — the real shapes the nine inputs take across scheduling   */
/* ------------------------------------------------------------------ */

interface ScenarioProps {
  variant: VariantKey;
}

/** template-block-row.tsx — two bare TimeOfDay values, no day at all. */
function TemplateBlocksScenario({ variant }: ScenarioProps) {
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:30');
  const span = describeSpan(start, end);

  return (
    <ScenarioFrame
      title="Template blocks"
      source="template-block-row.tsx — 2 inputs"
      note="A TimeBlock is authored as a bare TimeOfDay, before any date exists. Today: type=&quot;time&quot; with a lang=&quot;pt-BR&quot; attempt at forcing 24h."
      state={{ startTime: start, endTime: end }}
    >
      <div className="space-y-1">
        <Label>Label</Label>
        <Input defaultValue="Welcome" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabelledTimeField
          id="block-start"
          label="Start time"
          variant={variant}
          value={start}
          onChange={setStart}
        />
        <LabelledTimeField
          id="block-end"
          label="End time"
          variant={variant}
          value={end}
          onChange={setEnd}
        />
      </div>
      <div className="flex items-center gap-2">
        {span ? <SpanConfirmation span={span} /> : null}
        {/* A real template starts with no times at all. Worth being able to
            reach, since an empty field is where the `--` placeholders and the
            half-typed `1-` display are actually seen together. */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setStart('');
            setEnd('');
          }}
        >
          Clear (new row)
        </Button>
      </div>
    </ScenarioFrame>
  );
}

/** slot-form-fields.tsx — a TimeSlot's bounds are Instants, so on a single
 * day this is one CalendarDay plus two TimeOfDay values. */
function SlotBoundsScenario({ variant }: ScenarioProps) {
  const [day, setDay] = useState('2027-01-04');
  const [start, setStart] = useState('08:30');
  const [end, setEnd] = useState('12:00');
  const span = describeSpan(start, end);

  return (
    <ScenarioFrame
      title="Slot bounds"
      source="slot-form-fields.tsx — 2 inputs, polymorphic"
      note="Today this box silently switches between type=&quot;time&quot; and type=&quot;datetime-local&quot; depending on whether the Event is multi-day. Splitting day from time removes that branch entirely."
      state={{ day, startTime: start, endTime: end }}
    >
      <div className="space-y-1">
        <Label>Label</Label>
        <Input defaultValue="Sound check" />
      </div>
      <div className="space-y-1">
        <Label>Day</Label>
        <DatePickerField value={day} onChange={setDay} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabelledTimeField
          id="slot-start"
          label="Start"
          variant={variant}
          value={start}
          onChange={setStart}
        />
        <LabelledTimeField
          id="slot-end"
          label="End"
          variant={variant}
          value={end}
          onChange={setEnd}
        />
      </div>
      {span ? <SpanConfirmation span={span} /> : null}
    </ScenarioFrame>
  );
}

/** manual-split-editor.tsx — a Shift span that runs past midnight. The case
 * #128 unlocked by removing time_block's `start < end` check. */
function OvernightShiftScenario({ variant }: ScenarioProps) {
  const [day, setDay] = useState('2027-01-04');
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('02:00');
  const span = describeSpan(start, end);
  const crossesMidnight = span?.includes('next day') ?? false;

  return (
    <ScenarioFrame
      title="Overnight shift"
      source="manual-split-editor.tsx — 2 inputs per span, unbounded"
      note="#128 removed the start < end constraint: an end before its start now means the Shift runs onto the next CalendarDay. The form has to confirm that rather than reject it."
      state={{ day, startTime: start, endTime: end, crossesMidnight }}
    >
      <div className="space-y-1">
        <Label>Starts on</Label>
        <DatePickerField value={day} onChange={setDay} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <LabelledTimeField
          id="shift-start"
          label="Shift start"
          variant={variant}
          value={start}
          onChange={setStart}
        />
        <LabelledTimeField
          id="shift-end"
          label="Shift end"
          variant={variant}
          value={end}
          onChange={setEnd}
        />
      </div>
      <div className="space-y-1">
        <Label>Shift label</Label>
        <Input defaultValue="Overnight watch" />
      </div>
      {span ? <SpanConfirmation span={span} /> : null}
    </ScenarioFrame>
  );
}

/** tailoring-filters.tsx — not authoring. A coarse window over a list. */
function FilterScenario({ variant }: ScenarioProps) {
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');

  return (
    <ScenarioFrame
      title="Tailoring filter"
      source="tailoring-filters.tsx — 2 inputs"
      note="The one non-authoring surface. Q4 settled that it gets the identical control, shortcuts included — so this view is checking that the control still reads right in a cramped filter row, not just in a form."
      state={{ mode: 'within', start, end }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28">
          <Label>Mode</Label>
          <Input defaultValue="Between" readOnly />
        </div>
        <div className="min-w-32 flex-1">
          <LabelledTimeField
            id="filter-start"
            label="From"
            variant={variant}
            value={start}
            onChange={setStart}
          />
        </div>
        <div className="min-w-32 flex-1">
          <LabelledTimeField
            id="filter-end"
            label="To"
            variant={variant}
            value={end}
            onChange={setEnd}
          />
        </div>
      </div>
    </ScenarioFrame>
  );
}

function SpanConfirmation({ span }: { span: string }) {
  return (
    <p
      className="text-muted-foreground text-sm"
      data-testid="span-confirmation"
    >
      Runs <span className="font-medium text-foreground">{span}</span>
    </p>
  );
}

interface ScenarioFrameProps {
  title: string;
  source: string;
  note: string;
  state: Record<string, unknown>;
  children: ReactNode;
}

function ScenarioFrame({
  title,
  source,
  note,
  state,
  children,
}: ScenarioFrameProps) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold text-base">{title}</h2>
          <p className="font-mono text-muted-foreground text-xs">{source}</p>
        </div>
        {children}
      </div>
      <aside className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-1 font-medium text-xs">Why this scenario</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {note}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <p className="mb-1 font-medium text-xs">Value submitted</p>
          <pre className="overflow-auto font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(state, null, 2)}
          </pre>
        </div>
      </aside>
    </div>
  );
}

const SCENARIO_COMPONENTS: Record<
  ScenarioKey,
  (props: ScenarioProps) => ReactNode
> = {
  blocks: TemplateBlocksScenario,
  slot: SlotBoundsScenario,
  overnight: OvernightShiftScenario,
  filter: FilterScenario,
};

/* ------------------------------------------------------------------ */

function TimeEntryPrototype() {
  const navigate = Route.useNavigate();
  const { variant } = Route.useSearch();
  const [scenario, setScenario] = useState<ScenarioKey>('blocks');
  const [touch, setTouch] = useState(false);

  const Scenario = SCENARIO_COMPONENTS[scenario];

  return (
    // Deliberately NOT z-[100] like the active-church prototype: Popover
    // portals to document.body at z-50, so a z-100 wrapper paints the quick
    // list underneath the page. Variant B is invisible without this.
    <div className="fixed inset-0 z-10 overflow-auto bg-background text-foreground">
      <header className="border-border border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="mr-auto">
            <p className="font-semibold text-sm">Time entry direction</p>
            <p className="text-muted-foreground text-xs">
              Prototype for issue #133 — 24h locked, odd minutes allowed, no
              timezone indicator
            </p>
          </div>
          {SCENARIOS.map((entry) => (
            <Button
              key={entry.key}
              type="button"
              size="xs"
              variant={scenario === entry.key ? 'secondary' : 'ghost'}
              onClick={() => setScenario(entry.key as ScenarioKey)}
            >
              {entry.label}
            </Button>
          ))}
          <Button
            type="button"
            size="xs"
            variant={touch ? 'secondary' : 'outline'}
            onClick={() => setTouch((previous) => !previous)}
          >
            {touch ? 'Touch sizing' : 'Desktop sizing'}
          </Button>
        </div>
      </header>

      <main className="py-6 pb-28">
        <FormControlSizeProvider size={touch ? 'touch' : 'default'}>
          <Scenario variant={variant} />
        </FormControlSizeProvider>
      </main>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(next) =>
          navigate({ search: { variant: parseVariant(next) }, replace: true })
        }
      />
    </div>
  );
}

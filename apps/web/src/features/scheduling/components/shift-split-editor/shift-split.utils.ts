import { m } from '@church/i18n/messages';
import {
  parseTimeOfDay,
  type TimeOfDay,
  timeOfDayOffset,
  timeOfDaySpan,
} from '@church/time';
import type { HeadcountGridShift } from '@/features/scheduling/components/headcount-grid/headcount-grid';

/** Past this an equal split is a typo, and its grid would freeze the page. */
export const MAX_EQUAL_SHIFTS = 50;

export type ShiftSplitMode = 'whole' | 'equal' | 'manual';

/** One manual Shift while it is edited; a half-entered time is `null`. */
export interface ManualSpanDraft {
  key: string;
  label: string;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
}

/** The editor's draft; `equalCount` stays text so invalid input is kept. */
export interface ShiftSplitDraft {
  mode: ShiftSplitMode;
  equalCount: string;
  spans: ManualSpanDraft[];
}

/** The recurring Time block the split lives in, as TimeOfDay (never Instants). */
export interface ShiftSplitBlockBounds {
  startTime: TimeOfDay;
  endTime: TimeOfDay;
}

export interface ShiftSplitSpan {
  label?: string;
  startTime: string;
  endTime: string;
}

/** The saved shape: the split discriminant the Usual setup API stores. */
export type ShiftSplitValue =
  | { kind: 'equal'; count: number }
  | { kind: 'manual'; spans: ShiftSplitSpan[] };

export type SpanProblem =
  | 'incomplete'
  | 'zeroDuration'
  | 'outsideBlock'
  | 'overlap';

export interface ShiftSplitProblems {
  count: boolean;
  noSpans: boolean;
  /** One entry per manual span, in order; `null` when that span is fine. */
  spans: (SpanProblem | null)[];
}

interface DraftInput {
  draft: ShiftSplitDraft;
}

interface ShiftSplitInput {
  shiftSplit: ShiftSplitValue;
}

interface TimesInput {
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
}

interface TimeRangeInput {
  startTime: string;
  endTime: string;
}

/** `09:00–11:00`, marked when the end falls on the next day. */
export function formatTimeRange({ startTime, endTime }: TimeRangeInput) {
  const start = parseTimeOfDay({ value: startTime });
  const end = parseTimeOfDay({ value: endTime });
  const range = `${start}–${end}`;
  const { crossesToNextDay } = timeOfDaySpan({ start, end });
  return crossesToNextDay ? `${range} (${m.usual_setup_next_day()})` : range;
}

export function newSpanDraft({
  startTime,
  endTime,
}: TimesInput): ManualSpanDraft {
  return { key: crypto.randomUUID(), label: '', startTime, endTime };
}

export function toShiftSplitDraft({
  shiftSplit,
}: ShiftSplitInput): ShiftSplitDraft {
  if (shiftSplit.kind === 'manual') {
    return {
      mode: 'manual',
      equalCount: '2',
      spans: shiftSplit.spans.map((span) => ({
        ...newSpanDraft({
          startTime: parseTimeOfDay({ value: span.startTime }),
          endTime: parseTimeOfDay({ value: span.endTime }),
        }),
        label: span.label ?? '',
      })),
    };
  }
  return {
    mode: shiftSplit.count === 1 ? 'whole' : 'equal',
    equalCount: shiftSplit.count === 1 ? '2' : String(shiftSplit.count),
    spans: [],
  };
}

function parseEqualCount({ draft }: DraftInput): number | null {
  const text = draft.equalCount.trim();
  if (!/^\d+$/.test(text)) return null;
  const count = Number.parseInt(text, 10);
  return count >= 1 && count <= MAX_EQUAL_SHIFTS ? count : null;
}

interface SpanProblemsInput {
  spans: ManualSpanDraft[];
  block: ShiftSplitBlockBounds;
}

/** Judged in minutes after the block's start, so overnight needs no dates. */
function spanProblems({ spans, block }: SpanProblemsInput) {
  const blockMinutes = timeOfDaySpan({
    start: block.startTime,
    end: block.endTime,
  }).durationMinutes;
  let previousEnd = 0;
  return spans.map((span): SpanProblem | null => {
    if (!span.startTime || !span.endTime) return 'incomplete';
    const { durationMinutes } = timeOfDaySpan({
      start: span.startTime,
      end: span.endTime,
    });
    if (durationMinutes === 0) return 'zeroDuration';
    const start = timeOfDayOffset({
      from: block.startTime,
      to: span.startTime,
    });
    const end = start + durationMinutes;
    if (end > blockMinutes) return 'outsideBlock';
    if (start < previousEnd) return 'overlap';
    previousEnd = end;
    return null;
  });
}

interface ProblemsInput extends DraftInput {
  block: ShiftSplitBlockBounds;
}

/** Mirrors the API's refusals, so Save is disabled before a round trip. */
export function shiftSplitProblems({
  draft,
  block,
}: ProblemsInput): ShiftSplitProblems {
  if (draft.mode === 'whole')
    return { count: false, noSpans: false, spans: [] };
  if (draft.mode === 'equal') {
    return {
      count: parseEqualCount({ draft }) === null,
      noSpans: false,
      spans: [],
    };
  }
  return {
    count: false,
    noSpans: draft.spans.length === 0,
    spans: spanProblems({ spans: draft.spans, block }),
  };
}

interface IsShiftSplitValidInput {
  problems: ShiftSplitProblems;
}

export function isShiftSplitValid({
  problems,
}: IsShiftSplitValidInput): boolean {
  return (
    !problems.count && !problems.noSpans && problems.spans.every((p) => !p)
  );
}

/** The value to save; only call it for a draft with no problems. */
export function toShiftSplit({ draft }: DraftInput): ShiftSplitValue {
  if (draft.mode === 'manual') {
    return {
      kind: 'manual',
      spans: draft.spans.map((span) => ({
        ...(span.label.trim() ? { label: span.label.trim() } : {}),
        startTime: span.startTime as TimeOfDay,
        endTime: span.endTime as TimeOfDay,
      })),
    };
  }
  return {
    kind: 'equal',
    count: draft.mode === 'whole' ? 1 : (parseEqualCount({ draft }) ?? 1),
  };
}

/**
 * The grid's Shifts. Keys name a Shift's identity (its split and position, or
 * its exact times), so counts typed for an unchanged Shift survive a change
 * of split and come back if the split does.
 */
export function splitShifts({
  draft,
  block,
}: ProblemsInput): HeadcountGridShift[] {
  if (draft.mode === 'manual') {
    const seen = new Map<string, number>();
    return draft.spans.map((span, index) => {
      const number = index + 1;
      const identity =
        span.startTime && span.endTime
          ? `${span.startTime}-${span.endTime}`
          : `draft-${span.key}`;
      const repeats = seen.get(identity) ?? 0;
      seen.set(identity, repeats + 1);
      const name = span.label.trim() || m.usual_setup_shift_label({ number });
      return {
        key: repeats === 0 ? identity : `${identity}#${repeats}`,
        label:
          span.startTime && span.endTime
            ? `${name} · ${formatTimeRange({ startTime: span.startTime, endTime: span.endTime })}`
            : name,
      };
    });
  }
  const count = draft.mode === 'whole' ? 1 : (parseEqualCount({ draft }) ?? 0);
  return Array.from({ length: count }, (_, index) => ({
    // The whole block shares its identity with a manual span covering it.
    key:
      count === 1 ? `${block.startTime}-${block.endTime}` : `${count}:${index}`,
    label:
      count === 1
        ? m.usual_setup_whole_block_shift()
        : m.usual_setup_shift_label({ number: index + 1 }),
  }));
}

interface ChangeModeInput extends DraftInput {
  mode: ShiftSplitMode;
  block: ShiftSplitBlockBounds;
}

/** Switching mode keeps every other part of the draft, so it can be undone. */
export function changeShiftSplitMode({
  draft,
  mode,
  block,
}: ChangeModeInput): ShiftSplitDraft {
  if (mode === 'manual' && draft.spans.length === 0) {
    return {
      ...draft,
      mode,
      spans: [
        newSpanDraft({ startTime: block.startTime, endTime: block.endTime }),
      ],
    };
  }
  return { ...draft, mode };
}

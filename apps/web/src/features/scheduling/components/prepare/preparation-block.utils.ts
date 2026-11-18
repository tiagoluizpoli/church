import {
  addCalendarDays,
  addMilliseconds,
  compareInstants,
  millisecondsBetween,
  parseInstant,
  type TimeOfDay,
  toInstant,
} from '@church/time';
import {
  type HeadcountGridMinimums,
  type HeadcountGridShift,
  headcountGridKey,
} from '@/features/scheduling/components/headcount-grid/headcount-grid';
import {
  type ShiftSplitDraft,
  type ShiftSplitProblems,
  type SpanProblem,
  shiftSplitProblems,
  splitShifts,
  toShiftSplit,
  toShiftSplitDraft,
} from '@/features/scheduling/components/shift-split-editor/shift-split.utils';
import type {
  GetCycleParticipation200EventsItemEventTimeBlocksItem,
  SaveEventTimeBlockPreparationBodyShiftSplit,
} from '@/infrastructure/api/churchAPI.schemas';
import { churchTimeOfDay, dayOf } from '@/shared/utils/church-time';

export type PreparationBlock =
  GetCycleParticipation200EventsItemEventTimeBlocksItem;

interface PreparationSplitInput {
  draft: ShiftSplitDraft;
  block: PreparationBlock;
  timeZone: string;
}

interface ResolveTimeInput {
  time: TimeOfDay;
  block: PreparationBlock;
  timeZone: string;
  end?: boolean;
  startTime?: TimeOfDay;
  savedInstant?: string;
}

function resolveTime({
  time,
  block,
  timeZone,
  end,
  startTime,
  savedInstant,
}: ResolveTimeInput): string {
  // A saved boundary keeps its CalendarDay when its clock time is edited.
  if (savedInstant) {
    const day = dayOf({ value: savedInstant, timeZone });
    return toInstant({ day, time, timeZone });
  }
  const { startTime: blockStart, endTime: blockEnd } = block.eventTimeBlock;
  const start = churchTimeOfDay({ value: blockStart, timeZone });
  const finish = churchTimeOfDay({ value: blockEnd, timeZone });
  // Keep exact seconds and the server's chosen offset at unchanged bounds.
  if (!end && time === start) return blockStart;
  if (end && time === finish) return blockEnd;
  const blockDay = dayOf({ value: blockStart, timeZone });
  const startOffset = (startTime ?? time) < start ? 1 : 0;
  const endOffset = end && startTime && time < startTime ? 1 : 0;
  const day = addCalendarDays({ day: blockDay, days: startOffset + endOffset });
  return toInstant({ day, time, timeZone });
}

/** Recurring controls at the boundary; absolute Instants on the wire. */
export function toPreparationSplit({
  draft,
  block,
  timeZone,
}: PreparationSplitInput): SaveEventTimeBlockPreparationBodyShiftSplit {
  const split = toShiftSplit({ draft });
  if (split.kind === 'equal') return split;
  const spans = preparationManualSpans({ draft, block, timeZone });
  return { kind: 'manual', spans };
}

function preparationManualSpans({
  draft,
  block,
  timeZone,
}: PreparationSplitInput) {
  return draft.spans.flatMap((span) => {
    const { startTime, endTime, label } = span;
    if (!startTime || !endTime) return [];
    const saved = block.shifts.find((shift) => shift.id === span.key);
    const savedStart =
      saved && churchTimeOfDay({ value: saved.startTime, timeZone });
    const savedEnd =
      saved && churchTimeOfDay({ value: saved.endTime, timeZone });
    const start =
      saved && savedStart === startTime
        ? saved.startTime
        : resolveTime({
            time: startTime,
            block,
            timeZone,
            savedInstant: saved?.startTime,
          });
    const end =
      saved && savedEnd === endTime
        ? saved.endTime
        : resolveTime({
            time: endTime,
            startTime,
            block,
            timeZone,
            end: true,
            savedInstant: saved?.endTime,
          });
    return [
      {
        startTime: parseInstant({ value: start }),
        endTime: parseInstant({ value: end }),
        ...(label.trim() ? { label: label.trim() } : {}),
      },
    ];
  });
}

interface PreparationBlockInput {
  block: PreparationBlock;
  timeZone: string;
}

interface PreparationSpan {
  startTime: string;
  endTime: string;
}

interface EqualSpansInput {
  block: PreparationBlock;
  count: number;
}

function equalSpans({ block, count }: EqualSpansInput): PreparationSpan[] {
  const start = parseInstant({ value: block.eventTimeBlock.startTime });
  const end = parseInstant({ value: block.eventTimeBlock.endTime });
  const duration = millisecondsBetween({ start, end });
  const step = Math.floor(duration / count);
  return Array.from({ length: count }, (_, index) => ({
    startTime: addMilliseconds({ instant: start, milliseconds: index * step }),
    endTime:
      index === count - 1
        ? end
        : addMilliseconds({ instant: start, milliseconds: (index + 1) * step }),
  }));
}

interface SameSpanInput {
  left: PreparationSpan;
  right: PreparationSpan;
}

function sameSpan({ left, right }: SameSpanInput): boolean {
  const leftStart = parseInstant({ value: left.startTime });
  const rightStart = parseInstant({ value: right.startTime });
  const leftEnd = parseInstant({ value: left.endTime });
  const rightEnd = parseInstant({ value: right.endTime });
  const starts = compareInstants({ left: leftStart, right: rightStart });
  const ends = compareInstants({ left: leftEnd, right: rightEnd });
  return starts === 0 && ends === 0;
}

/** Prepare spans live on the absolute timeline, including spans over 24 hours. */
export function preparationSplitProblems({
  draft,
  block,
  timeZone,
}: PreparationSplitInput): ShiftSplitProblems {
  if (draft.mode !== 'manual') {
    const bounds = preparationBounds({ block, timeZone });
    return shiftSplitProblems({ draft, block: bounds });
  }
  const incomplete = draft.spans.map((span): SpanProblem | null =>
    !span.startTime || !span.endTime ? 'incomplete' : null,
  );
  if (incomplete.some(Boolean))
    return { count: false, noSpans: false, spans: incomplete };
  const spans = preparationManualSpans({ draft, block, timeZone });
  const { startTime, endTime } = block.eventTimeBlock;
  const blockStart = parseInstant({ value: startTime });
  const blockEnd = parseInstant({ value: endTime });
  let previousEnd = blockStart;
  return {
    count: false,
    noSpans: spans.length === 0,
    spans: spans.map((span): SpanProblem | null => {
      const start = parseInstant({ value: span.startTime });
      const end = parseInstant({ value: span.endTime });
      if (compareInstants({ left: start, right: end }) >= 0)
        return 'zeroDuration';
      if (
        compareInstants({ left: start, right: blockStart }) < 0 ||
        compareInstants({ left: end, right: blockEnd }) > 0
      )
        return 'outsideBlock';
      if (compareInstants({ left: start, right: previousEnd }) < 0)
        return 'overlap';
      previousEnd = end;
      return null;
    }),
  };
}

export function preparationBounds({ block, timeZone }: PreparationBlockInput) {
  return {
    startTime: churchTimeOfDay({
      value: block.eventTimeBlock.startTime,
      timeZone,
    }),
    endTime: churchTimeOfDay({ value: block.eventTimeBlock.endTime, timeZone }),
  };
}

export function initialPreparationDraft({
  block,
  timeZone,
}: PreparationBlockInput): ShiftSplitDraft {
  const { shifts } = block;
  const count = shifts.length || 1;
  const expected = equalSpans({ block, count });
  if (
    shifts.every(
      (shift, index) =>
        !shift.label &&
        expected[index] &&
        sameSpan({ left: shift, right: expected[index] }),
    )
  ) {
    return toShiftSplitDraft({ shiftSplit: { kind: 'equal', count } });
  }
  const draft = toShiftSplitDraft({
    shiftSplit: {
      kind: 'manual',
      spans: shifts.map((shift) => ({
        startTime: churchTimeOfDay({ value: shift.startTime, timeZone }),
        endTime: churchTimeOfDay({ value: shift.endTime, timeZone }),
        ...(shift.label ? { label: shift.label } : {}),
      })),
    },
  });
  return {
    ...draft,
    spans: draft.spans.map((span, index) => ({
      ...span,
      key: shifts[index]?.id ?? span.key,
    })),
  };
}

export interface PreparationGridShift extends HeadcountGridShift {
  savedShiftId?: string;
}

/** Match absolute spans, so a new Shift never inherits another Shift's floor. */
export function preparationGridShifts({
  draft,
  block,
  timeZone,
}: PreparationSplitInput): PreparationGridShift[] {
  const bounds = preparationBounds({ block, timeZone });
  const grid = splitShifts({ draft, block: bounds });
  const split = toPreparationSplit({ draft, block, timeZone });
  const spans =
    split.kind === 'equal'
      ? equalSpans({ block, count: split.count })
      : split.spans;
  return grid.map((shift, index) => {
    const span = spans[index];
    const saved =
      span &&
      block.shifts.find((candidate) =>
        sameSpan({ left: span, right: candidate }),
      );
    return { ...shift, savedShiftId: saved?.id };
  });
}

interface PreparationMinimumsInput {
  block: PreparationBlock;
  shifts: PreparationGridShift[];
}

export function preparationMinimums({
  block,
  shifts,
}: PreparationMinimumsInput): HeadcountGridMinimums {
  return Object.fromEntries(
    shifts.flatMap((shift) => {
      const saved = block.shifts.find(
        (candidate) => candidate.id === shift.savedShiftId,
      );
      return (saved?.requirements ?? []).map(
        ({ sectorId, roleId, assignedCount }) => [
          headcountGridKey({ shiftKey: shift.key, sectorId, roleId }),
          assignedCount,
        ],
      );
    }),
  );
}

import type {
  ChurchId,
  MinistryParticipationId,
  TimeSlotId,
} from '../branded-ids';
import { Shift } from '../entities/shift';
import { InvalidShiftSplitError } from '../errors/invalid-shift-split';

export interface EqualNSplitStrategy {
  kind: 'equal-n';
  n: number;
}

export interface ManualSplitSpan {
  startTime: Date;
  endTime: Date;
  label?: string;
}

export interface ManualSplitStrategy {
  kind: 'manual';
  spans: ManualSplitSpan[];
}

export type ShiftSplitStrategy = EqualNSplitStrategy | ManualSplitStrategy;

export interface SplitTargetTimeSlot {
  id: TimeSlotId;
  startTime: Date;
  endTime: Date;
}

export interface SplitShiftsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlot: SplitTargetTimeSlot;
  strategy: ShiftSplitStrategy;
}

export interface EqualSpan {
  startTime: Date;
  endTime: Date;
}

export interface ComputeEqualSpansInput {
  startTime: Date;
  endTime: Date;
  n: number;
}

/**
 * Tiles [startTime, endTime) into n contiguous spans. The final span absorbs
 * any indivisible remainder so the spans cover the range exactly (CL-014).
 */
export function computeEqualSpans({
  startTime,
  endTime,
  n,
}: ComputeEqualSpansInput): EqualSpan[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new InvalidShiftSplitError('split count must be a positive integer');
  }

  const totalMs = endTime.getTime() - startTime.getTime();
  const baseMs = Math.floor(totalMs / n);

  if (baseMs < 1) {
    throw new InvalidShiftSplitError('slot is too short for the split count');
  }

  const spans: EqualSpan[] = [];

  for (let index = 0; index < n; index += 1) {
    const spanStart = new Date(startTime.getTime() + index * baseMs);
    const spanEnd =
      index === n - 1
        ? endTime
        : new Date(startTime.getTime() + (index + 1) * baseMs);
    spans.push({ startTime: spanStart, endTime: spanEnd });
  }

  return spans;
}

export class ShiftSplitter {
  split({
    churchId,
    participationId,
    timeSlot,
    strategy,
  }: SplitShiftsInput): Shift[] {
    const spans: ManualSplitSpan[] =
      strategy.kind === 'equal-n'
        ? computeEqualSpans({
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
            n: strategy.n,
          })
        : normalizeManualSpans({ spans: strategy.spans });

    return spans.map(
      (span) =>
        new Shift({
          props: {
            churchId,
            participationId,
            timeSlotId: timeSlot.id,
            startTime: span.startTime,
            endTime: span.endTime,
            label: span.label,
          },
          slotBounds: {
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
          },
        }),
    );
  }
}

interface NormalizeManualSpansInput {
  spans: ManualSplitSpan[];
}

function normalizeManualSpans({
  spans,
}: NormalizeManualSpansInput): ManualSplitSpan[] {
  if (spans.length === 0) {
    throw new InvalidShiftSplitError('manual split requires at least one span');
  }

  const ordered = [...spans].sort(
    (left, right) => left.startTime.getTime() - right.startTime.getTime(),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if (previous && current && current.startTime < previous.endTime) {
      throw new InvalidShiftSplitError('manual spans must not overlap');
    }
  }

  return ordered;
}

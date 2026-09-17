import {
  addMilliseconds,
  compareInstants,
  type Instant,
  millisecondsBetween,
} from '@church/time';
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
  startTime: Instant;
  endTime: Instant;
  label?: string;
}

export interface ManualSplitStrategy {
  kind: 'manual';
  spans: ManualSplitSpan[];
}

export type ShiftSplitStrategy = EqualNSplitStrategy | ManualSplitStrategy;

export interface SplitTargetTimeSlot {
  id: TimeSlotId;
  startTime: Instant;
  endTime: Instant;
}

export interface SplitShiftsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlot: SplitTargetTimeSlot;
  strategy: ShiftSplitStrategy;
}

export interface EqualSpan {
  startTime: Instant;
  endTime: Instant;
}

export interface ComputeEqualSpansInput {
  startTime: Instant;
  endTime: Instant;
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

  const totalMs = millisecondsBetween({ start: startTime, end: endTime });
  const baseMs = Math.floor(totalMs / n);

  if (baseMs < 1) {
    throw new InvalidShiftSplitError('slot is too short for the split count');
  }

  const spans: EqualSpan[] = [];

  for (let index = 0; index < n; index += 1) {
    const spanStart = addMilliseconds({
      instant: startTime,
      milliseconds: index * baseMs,
    });
    const spanEnd =
      index === n - 1
        ? endTime
        : addMilliseconds({
            instant: startTime,
            milliseconds: (index + 1) * baseMs,
          });
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

  const ordered = [...spans].sort((left, right) =>
    compareInstants({ left: left.startTime, right: right.startTime }),
  );

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if (
      previous &&
      current &&
      compareInstants({ left: current.startTime, right: previous.endTime }) < 0
    ) {
      throw new InvalidShiftSplitError('manual spans must not overlap');
    }
  }

  return ordered;
}

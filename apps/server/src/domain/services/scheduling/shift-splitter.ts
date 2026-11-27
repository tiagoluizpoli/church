import {
  addMilliseconds,
  compareInstants,
  millisecondsBetween,
} from '@church/time';
import { Shift } from '../../entities/shift';
import { InvalidShiftSplitError } from '../../errors/invalid-shift-split';
import type {
  ComputeEqualSpansInput,
  EqualSpan,
  ManualSplitSpan,
  NormalizeManualSpansInput,
  SplitShiftsInput,
} from './shift-splitter.types';

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
    throw new InvalidShiftSplitError(
      'event time block is too short for the split count',
    );
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
    eventTimeBlock,
    strategy,
  }: SplitShiftsInput): Shift[] {
    const spans: ManualSplitSpan[] =
      strategy.kind === 'equal-n'
        ? computeEqualSpans({
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
            n: strategy.n,
          })
        : normalizeManualSpans({ spans: strategy.spans });

    return spans.map(
      (span) =>
        new Shift({
          props: {
            churchId,
            participationId,
            eventTimeBlockId: eventTimeBlock.id,
            startTime: span.startTime,
            endTime: span.endTime,
            label: span.label,
          },
          eventTimeBlockBounds: {
            startTime: eventTimeBlock.startTime,
            endTime: eventTimeBlock.endTime,
          },
        }),
    );
  }
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

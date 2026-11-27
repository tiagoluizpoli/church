import type { Instant } from '@church/time';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
} from '../../branded-ids';
import type { Shift } from '../../entities/shift';

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

export interface SplitTargetEventTimeBlock {
  id: EventTimeBlockId;
  startTime: Instant;
  endTime: Instant;
}

export interface SplitShiftsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  eventTimeBlock: SplitTargetEventTimeBlock;
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

export interface NormalizeManualSpansInput {
  spans: ManualSplitSpan[];
}

export interface IShiftSplitter {
  split(input: SplitShiftsInput): Shift[];
}

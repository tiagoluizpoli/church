import type { Instant, TimeOfDay } from '@church/time';
import type { TemplateTimeBlock } from '../../entities/template-time-block';
import type {
  UsualSetup,
  UsualSetupHeadcount,
  UsualSetupShiftSplit,
} from '../../entities/usual-setup';

export interface UsualSetupBlockBounds {
  startTime: Instant;
  endTime: Instant;
}

export interface PlannedUsualSetupShift extends UsualSetupBlockBounds {
  label?: string;
  headcounts: UsualSetupHeadcount[];
}

export interface PlanUsualSetupShiftsInput {
  shiftSplit: UsualSetupShiftSplit;
  headcounts: UsualSetupHeadcount[];
  /** The actual EventTimeBlock bounds: a frozen copy, not the current template. */
  block: UsualSetupBlockBounds;
  timeZone: string;
}

export interface UsualSetupShiftPlan {
  /** True when the split was unusable and the whole-block fallback was planned. */
  fallback: boolean;
  shifts: PlannedUsualSetupShift[];
}

export interface ResolveManualSpansInput {
  spans: Extract<UsualSetupShiftSplit, { kind: 'manual' }>['spans'];
  block: UsualSetupBlockBounds;
  timeZone: string;
}

export interface SplitFitsBlockInput {
  shiftSplit: UsualSetupShiftSplit;
  block: UsualSetupBlockBounds;
  timeZone: string;
}

export interface SpansFitBlockInput {
  spans: UsualSetupBlockBounds[];
  block: UsualSetupBlockBounds;
}

export interface WallClockUtcBoundsInput {
  startTime: TimeOfDay;
  endTime: TimeOfDay;
}

export interface WallClockUtcBounds {
  block: UsualSetupBlockBounds;
  timeZone: string;
}

export interface SumHeadcountsInput {
  headcounts: UsualSetupHeadcount[];
  /** The index the summed rows are written onto. */
  shiftIndex: number;
}

export interface UsualSetupNeedsReviewInput {
  entry: UsualSetup | undefined;
  block: TemplateTimeBlock;
}

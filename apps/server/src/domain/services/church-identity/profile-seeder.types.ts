import type { Instant } from '@church/time';
import type { EventTimeBlockId, TemplateTimeBlockId } from '../../branded-ids';
import type { DefaultDirection } from '../../entities/ministry';
import type {
  UsualSetupHeadcount,
  UsualSetupShiftSplit,
} from '../../entities/usual-setup';

export interface ProfileSeederEventTimeBlock {
  eventTimeBlockId: EventTimeBlockId;
  sourceTemplateTimeBlockId?: TemplateTimeBlockId;
  startTime: Instant;
  endTime: Instant;
}

export interface ProfileSeederEntry {
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  serves: boolean;
  shiftSplit: UsualSetupShiftSplit;
  headcounts: UsualSetupHeadcount[];
}

export interface SeedParticipationPlanInput {
  eventTimeBlock: ProfileSeederEventTimeBlock;
  profileEntries: ProfileSeederEntry[];
  /** Three-tier default: profile entry > ministry direction > global flag (R10). */
  ministryDefaultDirection?: DefaultDirection;
  globalDefaultAllIn: boolean;
  timeZone: string;
}

export interface SeededShiftPlan {
  startTime: Instant;
  endTime: Instant;
  label?: string;
  headcounts: UsualSetupHeadcount[];
}

export interface ParticipationSeedPlan {
  include: boolean;
  shifts: SeededShiftPlan[];
}

export interface BuildProfileShiftsInput {
  eventTimeBlock: ProfileSeederEventTimeBlock;
  entry: ProfileSeederEntry;
  timeZone: string;
}

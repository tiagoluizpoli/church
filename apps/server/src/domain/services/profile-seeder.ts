import type { Instant } from '@church/time';
import type { EventTimeBlockId, TemplateTimeBlockId } from '../branded-ids';
import type { DefaultDirection } from '../entities/ministry';
import type {
  UsualSetupHeadcount,
  UsualSetupShiftSplit,
} from '../entities/usual-setup';
import { planUsualSetupShifts } from './usual-setup-planner';

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

const EXCLUDED_PLAN: ParticipationSeedPlan = { include: false, shifts: [] };

export class ProfileSeeder {
  plan({
    eventTimeBlock,
    profileEntries,
    ministryDefaultDirection,
    globalDefaultAllIn,
    timeZone,
  }: SeedParticipationPlanInput): ParticipationSeedPlan {
    // Dynamic events (no template block) are never auto-seeded (DL1-PS-05).
    if (!eventTimeBlock.sourceTemplateTimeBlockId) {
      return EXCLUDED_PLAN;
    }

    const entry = profileEntries.find(
      (candidate) =>
        candidate.sourceTemplateTimeBlockId ===
        eventTimeBlock.sourceTemplateTimeBlockId,
    );

    if (entry) {
      if (!entry.serves) {
        return EXCLUDED_PLAN;
      }

      return {
        include: true,
        shifts: buildProfileShifts({ eventTimeBlock, entry, timeZone }),
      };
    }

    const direction =
      ministryDefaultDirection ?? (globalDefaultAllIn ? 'all_in' : 'all_out');

    if (direction === 'all_out') {
      return EXCLUDED_PLAN;
    }

    return {
      include: true,
      shifts: [
        {
          startTime: eventTimeBlock.startTime,
          endTime: eventTimeBlock.endTime,
          headcounts: [],
        },
      ],
    };
  }
}

interface BuildProfileShiftsInput {
  eventTimeBlock: ProfileSeederEventTimeBlock;
  entry: ProfileSeederEntry;
  timeZone: string;
}

function buildProfileShifts({
  eventTimeBlock,
  entry,
  timeZone,
}: BuildProfileShiftsInput): SeededShiftPlan[] {
  return planUsualSetupShifts({
    shiftSplit: entry.shiftSplit,
    headcounts: entry.headcounts,
    block: eventTimeBlock,
    timeZone,
  }).shifts;
}

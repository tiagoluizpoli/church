import { planUsualSetupShifts } from '../scheduling/usual-setup-planner';
import type {
  BuildProfileShiftsInput,
  ParticipationSeedPlan,
  SeededShiftPlan,
  SeedParticipationPlanInput,
} from './profile-seeder.types';

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

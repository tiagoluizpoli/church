import { type Instant, today, toInstant } from '@church/time';
import type { EventTimeBlockId, TemplateTimeBlockId } from '../branded-ids';
import type { DefaultDirection } from '../entities/ministry';
import type {
  UsualSetupHeadcount,
  UsualSetupShiftSplit,
} from '../entities/usual-setup';
import { computeEqualSpans } from './shift-splitter';

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
  slot: ProfileSeederEventTimeBlock;
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
    slot,
    profileEntries,
    ministryDefaultDirection,
    globalDefaultAllIn,
    timeZone,
  }: SeedParticipationPlanInput): ParticipationSeedPlan {
    // Dynamic events (no template block) are never auto-seeded (DL1-PS-05).
    if (!slot.sourceTemplateTimeBlockId) {
      return EXCLUDED_PLAN;
    }

    const entry = profileEntries.find(
      (candidate) =>
        candidate.sourceTemplateTimeBlockId === slot.sourceTemplateTimeBlockId,
    );

    if (entry) {
      if (!entry.serves) {
        return EXCLUDED_PLAN;
      }

      return {
        include: true,
        shifts: buildProfileShifts({ slot, entry, timeZone }),
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
          startTime: slot.startTime,
          endTime: slot.endTime,
          headcounts: [],
        },
      ],
    };
  }
}

interface BuildProfileShiftsInput {
  slot: ProfileSeederEventTimeBlock;
  entry: ProfileSeederEntry;
  timeZone: string;
}

function buildProfileShifts({
  slot,
  entry,
  timeZone,
}: BuildProfileShiftsInput): SeededShiftPlan[] {
  if (entry.shiftSplit.kind === 'equal') {
    return computeEqualSpans({
      startTime: slot.startTime,
      endTime: slot.endTime,
      n: entry.shiftSplit.count,
    }).map((span) => ({
      startTime: span.startTime,
      endTime: span.endTime,
      headcounts: entry.headcounts,
    }));
  }

  const eventTimeBlockDate = today({ instant: slot.startTime, timeZone });

  return entry.shiftSplit.spans.map((span) => ({
    startTime: toInstant({
      day: eventTimeBlockDate,
      time: span.startTime,
      timeZone,
    }),
    endTime: toInstant({
      day: eventTimeBlockDate,
      time: span.endTime,
      timeZone,
    }),
    label: span.label,
    headcounts: entry.headcounts,
  }));
}

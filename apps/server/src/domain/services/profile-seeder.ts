import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { TimeBlockId, TimeSlotId } from '../branded-ids';
import type { DefaultDirection } from '../entities/ministry';
import type {
  ServingProfileHeadcount,
  ServingProfileManualSpan,
  ServingProfileShiftSplit,
} from '../entities/ministry-serving-profile';
import { computeEqualSpans } from './shift-splitter';

export interface ProfileSeederSlot {
  timeSlotId: TimeSlotId;
  sourceTemplateBlockId?: TimeBlockId;
  startTime: Date;
  endTime: Date;
}

export interface ProfileSeederEntry {
  sourceTemplateBlockId: TimeBlockId;
  serves: boolean;
  shiftSplit: ServingProfileShiftSplit;
  headcounts: ServingProfileHeadcount[];
}

export interface SeedParticipationPlanInput {
  slot: ProfileSeederSlot;
  profileEntries: ProfileSeederEntry[];
  /** Three-tier default: profile entry > ministry direction > global flag (R10). */
  ministryDefaultDirection?: DefaultDirection;
  globalDefaultAllIn: boolean;
  timeZone: string;
}

export interface SeededShiftPlan {
  startTime: Date;
  endTime: Date;
  label?: string;
  headcounts: ServingProfileHeadcount[];
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
    if (!slot.sourceTemplateBlockId) {
      return EXCLUDED_PLAN;
    }

    const entry = profileEntries.find(
      (candidate) =>
        candidate.sourceTemplateBlockId === slot.sourceTemplateBlockId,
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
  slot: ProfileSeederSlot;
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

  const slotDate = formatInTimeZone(slot.startTime, timeZone, 'yyyy-MM-dd');

  return entry.shiftSplit.spans.map((span) => ({
    startTime: buildSpanInstant({ slotDate, time: span.startTime, timeZone }),
    endTime: buildSpanInstant({ slotDate, time: span.endTime, timeZone }),
    label: span.label,
    headcounts: entry.headcounts,
  }));
}

interface BuildSpanInstantInput {
  slotDate: string;
  time: ServingProfileManualSpan['startTime'];
  timeZone: string;
}

function buildSpanInstant({
  slotDate,
  time,
  timeZone,
}: BuildSpanInstantInput): Date {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${slotDate}T${normalizedTime}`, timeZone);
}

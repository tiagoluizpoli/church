import type { CalendarDay, Instant, TimeOfDay } from '@church/time';
import {
  buildEvent,
  buildMinistryParticipation,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
  type EventStatus,
  type ParticipationState,
} from '../../builders/scheduling';
import type { SeedWriter } from '../../recipe';
import type { JourneySeedIdOf } from '../journey-keys';
import { anchoredInstant } from './assign-church';

/**
 * One Event a single Ministry schedules: a Time Slot, the Ministry's
 * Participation in it, one Shift over the whole slot, and that Shift's Role
 * requirements. The shape every assign-board style journey starts from;
 * ids derive from `key`, so one recipe can build several.
 */

/** The Cycle a assign journey's Events belong to. */
export interface AssignCycleSummary {
  id: string;
  name: string;
}

export interface AssignRequirementPlan {
  roleId: string;
  requiredCount: number;
  /** Scopes the requirement to one Team (a TeamLeader's schedule seat). */
  teamId?: string;
}

export type AssignRequirementPlans = Readonly<
  Record<string, AssignRequirementPlan>
>;

export type RequirementKeyOf<TRequirements> = Extract<
  keyof TRequirements,
  string
>;

export interface BuildAssignEventInput<
  TRequirements extends AssignRequirementPlans,
> {
  db: SeedWriter;
  idOf: JourneySeedIdOf;
  churchId: string;
  cycleId: string;
  ministryId: string;
  /** Distinguishes this Event's rows from the recipe's other Events. */
  key: string;
  title: string;
  /** The Church-local day the Event happens on. */
  day: CalendarDay;
  /** Church-local wall clock. */
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  eventStatus: EventStatus;
  participationState: ParticipationState;
  /** Requirement key → requirement. */
  requirements: TRequirements;
}

export interface AssignRequirement {
  id: string;
  roleId: string;
  requiredCount: number;
  teamId: string | null;
}

export interface AssignEvent<TRequirementKey extends string> {
  id: string;
  title: string;
  /** Church-local day, `yyyy-MM-dd`: the builder's date column. */
  day: CalendarDay;
  startsAt: Instant;
  endsAt: Instant;
  participationId: string;
  timeSlotId: string;
  shiftId: string;
  requirements: Record<TRequirementKey, AssignRequirement>;
}

export async function buildAssignEvent<
  const TRequirements extends AssignRequirementPlans,
>({
  db,
  idOf,
  churchId,
  cycleId,
  ministryId,
  key,
  title,
  day,
  startTime,
  endTime,
  eventStatus,
  participationState,
  requirements,
}: BuildAssignEventInput<TRequirements>): Promise<
  AssignEvent<RequirementKeyOf<TRequirements>>
> {
  const startsAt = anchoredInstant({
    anchor: day,
    dayOffset: 0,
    time: startTime,
  });
  const endsAt = anchoredInstant({ anchor: day, dayOffset: 0, time: endTime });

  const event = await buildEvent({
    db,
    churchId,
    cycleId,
    id: idOf({ kind: `event:${key}` }),
    title,
    start: startsAt,
    end: endsAt,
    status: eventStatus,
  });
  const timeSlot = await buildTimeSlot({
    db,
    churchId,
    eventId: event.id,
    id: idOf({ kind: `time-slot:${key}` }),
    start: startsAt,
    end: endsAt,
  });
  const participation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId,
    eventId: event.id,
    id: idOf({ kind: `participation:${key}` }),
    state: participationState,
    timeSlotIds: [timeSlot.id],
  });
  const shift = await buildShift({
    db,
    churchId,
    participationId: participation.id,
    timeSlotId: timeSlot.id,
    id: idOf({ kind: `shift:${key}` }),
    start: startsAt,
    end: endsAt,
  });

  const built: Record<string, AssignRequirement> = {};
  for (const [requirementKey, requirement] of Object.entries(requirements)) {
    const row = await buildSlotRequirement({
      db,
      churchId,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: requirement.roleId,
      id: idOf({ kind: `slot-requirement:${key}:${requirementKey}` }),
      requiredCount: requirement.requiredCount,
      teamId: requirement.teamId,
    });
    built[requirementKey] = {
      id: row.id,
      roleId: row.roleId,
      requiredCount: row.requiredCount,
      teamId: row.teamId,
    };
  }

  return {
    id: event.id,
    title: event.title,
    day,
    startsAt,
    endsAt,
    participationId: participation.id,
    timeSlotId: timeSlot.id,
    shiftId: shift.id,
    // Built by iterating the plan's own keys, so the record is complete.
    requirements: built as Record<
      RequirementKeyOf<TRequirements>,
      AssignRequirement
    >,
  };
}

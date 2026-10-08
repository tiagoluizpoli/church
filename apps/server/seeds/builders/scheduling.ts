import {
  assignment,
  assignmentAudit,
  event,
  ministryParticipation,
  participationSlotInclusion,
  planningCycle,
  shift,
  slotRequirement,
  timeSlot,
} from '@church/db';
import {
  type CalendarDay,
  type Instant,
  parseInstant,
  toDate,
} from '@church/time';
import type { SeedWriter } from '../recipe';
import { deriveSeedId } from './derived-id';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for fixture graphs (ADR 0006): they write the rows a
 * journey starts from. A published Participation or a confirmed Assignment
 * bypasses the planning and publishing workflows by purpose; the workflows
 * themselves are exercised by the journeys, not seeded through here.
 */

export type SeededPlanningCycle = typeof planningCycle.$inferSelect;
export type SeededEvent = typeof event.$inferSelect;
export type SeededTimeSlot = typeof timeSlot.$inferSelect;
export type SeededMinistryParticipation =
  typeof ministryParticipation.$inferSelect;
export type SeededShift = typeof shift.$inferSelect;
export type SeededSlotRequirement = typeof slotRequirement.$inferSelect;
export type SeededAssignment = typeof assignment.$inferSelect;
export type PlanningCycleState = SeededPlanningCycle['state'];
export type EventStatus = SeededEvent['status'];
export type EventType = SeededEvent['eventType'];
export type ParticipationState = SeededMinistryParticipation['state'];
export type AssignmentStatus = SeededAssignment['status'];

export interface BuildPlanningCycleInput {
  db: SeedWriter;
  churchId: string;
  /** Left to the database when a test reads the identifier from the result. */
  id?: string;
  name: string;
  /** First day of the cycle; stored as a date, so no timezone is involved. */
  startDate: CalendarDay;
  endDate: CalendarDay;
  state: PlanningCycleState;
}

interface CalendarDayDateInput {
  day: CalendarDay;
}

/** A CalendarDay as the UTC-midnight `Date` the `date` columns round-trip. */
function calendarDayDate({ day }: CalendarDayDateInput): Date {
  return toDate({ instant: parseInstant({ value: `${day}T00:00:00Z` }) });
}

export async function buildPlanningCycle({
  db,
  churchId,
  id,
  name,
  startDate,
  endDate,
  state,
}: BuildPlanningCycleInput): Promise<SeededPlanningCycle> {
  return requireInsertedRow({
    rows: await db
      .insert(planningCycle)
      .values({
        id,
        churchId,
        name,
        startDate: calendarDayDate({ day: startDate }),
        endDate: calendarDayDate({ day: endDate }),
        state,
      })
      .returning(),
    description: `Planning Cycle ${name}`,
  });
}

export interface BuildEventInput {
  db: SeedWriter;
  churchId: string;
  planningCycleId: string;
  id?: string;
  title: string;
  start: Instant;
  end: Instant;
  status: EventStatus;
  /** Left to the column default when a fixture does not care. */
  eventType?: EventType;
  /** The EventTemplate it was generated from; absent for a dynamic Event. */
  sourceTemplateId?: string;
}

export async function buildEvent({
  db,
  churchId,
  planningCycleId,
  id,
  title,
  start,
  end,
  status,
  eventType,
  sourceTemplateId,
}: BuildEventInput): Promise<SeededEvent> {
  return requireInsertedRow({
    rows: await db
      .insert(event)
      .values({
        id,
        churchId,
        planningCycleId,
        title,
        start: toDate({ instant: start }),
        end: toDate({ instant: end }),
        status,
        eventType,
        sourceTemplateId,
      })
      .returning(),
    description: `Event ${title}`,
  });
}

export interface BuildTimeSlotInput {
  db: SeedWriter;
  churchId: string;
  eventId: string;
  id?: string;
  start: Instant;
  end: Instant;
  label?: string;
  /** The TimeBlock it was generated from; absent for a dynamic Event. */
  sourceTemplateBlockId?: string;
}

export async function buildTimeSlot({
  db,
  churchId,
  eventId,
  id,
  start,
  end,
  label,
  sourceTemplateBlockId,
}: BuildTimeSlotInput): Promise<SeededTimeSlot> {
  return requireInsertedRow({
    rows: await db
      .insert(timeSlot)
      .values({
        id,
        churchId,
        eventId,
        startTime: toDate({ instant: start }),
        endTime: toDate({ instant: end }),
        label,
        sourceTemplateBlockId,
      })
      .returning(),
    description: `Time Slot ${id}`,
  });
}

export interface BuildMinistryParticipationInput {
  db: SeedWriter;
  churchId: string;
  ministryId: string;
  eventId: string;
  id?: string;
  state: ParticipationState;
  /** The Time Slots the Ministry takes part in. */
  timeSlotIds: string[];
}

/** A Ministry's Participation in an Event with its Time Slot inclusions. */
export async function buildMinistryParticipation({
  db,
  churchId,
  ministryId,
  eventId,
  id,
  state,
  timeSlotIds,
}: BuildMinistryParticipationInput): Promise<SeededMinistryParticipation> {
  const participation = requireInsertedRow({
    rows: await db
      .insert(ministryParticipation)
      .values({ id, churchId, ministryId, eventId, state })
      .returning(),
    description: `Ministry Participation ${id}`,
  });

  if (timeSlotIds.length > 0) {
    await db.insert(participationSlotInclusion).values(
      timeSlotIds.map((timeSlotId) => ({
        id: deriveSeedId({
          kind: 'participation-slot-inclusion',
          parentIds: [participation.id, timeSlotId],
        }),
        churchId,
        participationId: participation.id,
        timeSlotId,
      })),
    );
  }

  return participation;
}

export interface BuildShiftInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  timeSlotId: string;
  id?: string;
  start: Instant;
  end: Instant;
  label?: string | null;
}

export async function buildShift({
  db,
  churchId,
  participationId,
  timeSlotId,
  id,
  start,
  end,
  label,
}: BuildShiftInput): Promise<SeededShift> {
  return requireInsertedRow({
    rows: await db
      .insert(shift)
      .values({
        id,
        churchId,
        participationId,
        timeSlotId,
        startTime: toDate({ instant: start }),
        endTime: toDate({ instant: end }),
        label,
      })
      .returning(),
    description: `Shift ${id}`,
  });
}

export interface BuildSlotRequirementInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  shiftId: string;
  roleId: string;
  id?: string;
  requiredCount: number;
  teamId?: string;
  notes?: string;
}

export async function buildSlotRequirement({
  db,
  churchId,
  participationId,
  shiftId,
  roleId,
  id,
  requiredCount,
  teamId,
  notes,
}: BuildSlotRequirementInput): Promise<SeededSlotRequirement> {
  return requireInsertedRow({
    rows: await db
      .insert(slotRequirement)
      .values({
        id,
        churchId,
        participationId,
        shiftId,
        roleId,
        requiredCount,
        teamId,
        notes,
      })
      .returning(),
    description: `Slot Requirement ${id}`,
  });
}

export interface BuildAssignmentInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  id?: string;
  status: AssignmentStatus;
  /** Why it was declined or cancelled. */
  reason?: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  assignedAt?: Instant;
  /** The User who made the Assignment. */
  assignedBy?: string;
}

export async function buildAssignment({
  db,
  churchId,
  participationId,
  shiftId,
  volunteerId,
  roleId,
  id,
  status,
  reason,
  assignedAt,
  assignedBy,
}: BuildAssignmentInput): Promise<SeededAssignment> {
  return requireInsertedRow({
    rows: await db
      .insert(assignment)
      .values({
        id,
        churchId,
        participationId,
        shiftId,
        volunteerId,
        roleId,
        status,
        reason,
        assignedAt:
          assignedAt === undefined
            ? undefined
            : toDate({ instant: assignedAt }),
        assignedBy,
      })
      .returning(),
    description: `Assignment ${id}`,
  });
}

export type SeededAssignmentAudit = typeof assignmentAudit.$inferSelect;
export type AssignmentAuditAction = SeededAssignmentAudit['action'];

export interface BuildAssignmentAuditInput {
  db: SeedWriter;
  churchId: string;
  assignmentId: string;
  actorId: string;
  id?: string;
  action: AssignmentAuditAction;
  reason?: string;
  /** Explicit, so a graph never depends on the wall clock at load time. */
  occurredAt: Instant;
}

/** One entry of an Assignment's audited history. */
export async function buildAssignmentAudit({
  db,
  churchId,
  assignmentId,
  actorId,
  id,
  action,
  reason,
  occurredAt,
}: BuildAssignmentAuditInput): Promise<SeededAssignmentAudit> {
  return requireInsertedRow({
    rows: await db
      .insert(assignmentAudit)
      .values({
        id,
        churchId,
        assignmentId,
        actorId,
        action,
        reason,
        timestamp: toDate({ instant: occurredAt }),
      })
      .returning(),
    description: `Assignment Audit ${id}`,
  });
}

export interface BuildAssignedShiftInput {
  db: SeedWriter;
  churchId: string;
  eventId: string;
  participationId: string;
  volunteerId: string;
  roleId: string;
  start: Instant;
  end: Instant;
  status: AssignmentStatus;
}

export interface BuiltAssignedShift {
  timeSlot: SeededTimeSlot;
  shift: SeededShift;
  assignment: SeededAssignment;
}

/**
 * A Volunteer's Assignment on a Shift that covers its own Time Slot over
 * `start`..`end`: the smallest schedule a fixture needs to hold a booking.
 */
export async function buildAssignedShift({
  db,
  churchId,
  eventId,
  participationId,
  volunteerId,
  roleId,
  start,
  end,
  status,
}: BuildAssignedShiftInput): Promise<BuiltAssignedShift> {
  const slot = await buildTimeSlot({ db, churchId, eventId, start, end });
  const slotShift = await buildShift({
    db,
    churchId,
    participationId,
    timeSlotId: slot.id,
    start,
    end,
  });
  const booked = await buildAssignment({
    db,
    churchId,
    participationId,
    shiftId: slotShift.id,
    volunteerId,
    roleId,
    status,
  });

  return { timeSlot: slot, shift: slotShift, assignment: booked };
}

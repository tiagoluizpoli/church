import {
  assignment,
  assignmentAudit,
  cycle,
  event,
  eventTimeBlock,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  sector,
  shift,
  shiftRequirement,
} from '@church/db';
import {
  type CalendarDay,
  type Instant,
  parseInstant,
  toDate,
} from '@church/time';
import { and, asc, eq } from 'drizzle-orm';
import type { SeedWriter } from '../recipe';
import { deriveSeedId } from './derived-id';
import { buildSector } from './ministry';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for fixture graphs (ADR 0006): they write the rows a
 * journey starts from. A published Participation or a confirmed Assignment
 * bypasses the planning and publishing workflows by purpose; the workflows
 * themselves are exercised by the journeys, not seeded through here.
 */

export type SeededCycle = typeof cycle.$inferSelect;
export type SeededEvent = typeof event.$inferSelect;
export type SeededEventTimeBlock = typeof eventTimeBlock.$inferSelect;
export type SeededMinistryParticipation =
  typeof ministryParticipation.$inferSelect;
export type SeededShift = typeof shift.$inferSelect;
export type SeededShiftRequirement = typeof shiftRequirement.$inferSelect;
export type SeededAssignment = typeof assignment.$inferSelect;
export type CycleState = SeededCycle['state'];
export type EventStatus = SeededEvent['status'];
export type ParticipationState = SeededMinistryParticipation['state'];
export type AssignmentStatus = SeededAssignment['status'];

export interface BuildCycleInput {
  db: SeedWriter;
  churchId: string;
  /** Left to the database when a test reads the identifier from the result. */
  id?: string;
  name: string;
  /** First day of the cycle; stored as a date, so no timezone is involved. */
  startDate: CalendarDay;
  endDate: CalendarDay;
  state: CycleState;
}

interface CalendarDayDateInput {
  day: CalendarDay;
}

/** A CalendarDay as the UTC-midnight `Date` the `date` columns round-trip. */
function calendarDayDate({ day }: CalendarDayDateInput): Date {
  return toDate({ instant: parseInstant({ value: `${day}T00:00:00Z` }) });
}

export async function buildCycle({
  db,
  churchId,
  id,
  name,
  startDate,
  endDate,
  state,
}: BuildCycleInput): Promise<SeededCycle> {
  return requireInsertedRow({
    rows: await db
      .insert(cycle)
      .values({
        id,
        churchId,
        name,
        startDate: calendarDayDate({ day: startDate }),
        endDate: calendarDayDate({ day: endDate }),
        state,
      })
      .returning(),
    description: `Cycle ${name}`,
  });
}

export interface BuildEventInput {
  db: SeedWriter;
  churchId: string;
  cycleId: string;
  id?: string;
  title: string;
  start: Instant;
  end: Instant;
  status: EventStatus;
  /** The EventTemplate it was generated from; absent for a dynamic Event. */
  sourceTemplateId?: string;
}

export async function buildEvent({
  db,
  churchId,
  cycleId,
  id,
  title,
  start,
  end,
  status,
  sourceTemplateId,
}: BuildEventInput): Promise<SeededEvent> {
  return requireInsertedRow({
    rows: await db
      .insert(event)
      .values({
        id,
        churchId,
        cycleId,
        title,
        start: toDate({ instant: start }),
        end: toDate({ instant: end }),
        status,
        sourceTemplateId,
      })
      .returning(),
    description: `Event ${title}`,
  });
}

export interface BuildEventTimeBlockInput {
  db: SeedWriter;
  churchId: string;
  eventId: string;
  id?: string;
  start: Instant;
  end: Instant;
  label?: string;
  /** The TemplateTimeBlock it was generated from; absent for a dynamic Event. */
  sourceTemplateTimeBlockId?: string;
}

export async function buildEventTimeBlock({
  db,
  churchId,
  eventId,
  id,
  start,
  end,
  label,
  sourceTemplateTimeBlockId,
}: BuildEventTimeBlockInput): Promise<SeededEventTimeBlock> {
  return requireInsertedRow({
    rows: await db
      .insert(eventTimeBlock)
      .values({
        id,
        churchId,
        eventId,
        startTime: toDate({ instant: start }),
        endTime: toDate({ instant: end }),
        label,
        sourceTemplateTimeBlockId,
      })
      .returning(),
    description: `Event Time Block ${id}`,
  });
}

export interface BuildMinistryParticipationInput {
  db: SeedWriter;
  churchId: string;
  ministryId: string;
  eventId: string;
  id?: string;
  state: ParticipationState;
  /** The Event Time Blocks the Ministry takes part in. */
  eventTimeBlockIds: string[];
}

/** A Ministry's Participation in an Event with its Event Time Block inclusions. */
export async function buildMinistryParticipation({
  db,
  churchId,
  ministryId,
  eventId,
  id,
  state,
  eventTimeBlockIds,
}: BuildMinistryParticipationInput): Promise<SeededMinistryParticipation> {
  const participation = requireInsertedRow({
    rows: await db
      .insert(ministryParticipation)
      .values({ id, churchId, ministryId, eventId, state })
      .returning(),
    description: `Ministry Participation ${id}`,
  });

  if (eventTimeBlockIds.length > 0) {
    await db.insert(participationEventTimeBlockInclusion).values(
      eventTimeBlockIds.map((eventTimeBlockId) => ({
        id: deriveSeedId({
          kind: 'participation-event-time-block-inclusion',
          parentIds: [participation.id, eventTimeBlockId],
        }),
        churchId,
        participationId: participation.id,
        eventTimeBlockId,
      })),
    );
  }

  return participation;
}

export interface BuildShiftInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  id?: string;
  start: Instant;
  end: Instant;
  label?: string | null;
}

export async function buildShift({
  db,
  churchId,
  participationId,
  eventTimeBlockId,
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
        eventTimeBlockId,
        startTime: toDate({ instant: start }),
        endTime: toDate({ instant: end }),
        label,
      })
      .returning(),
    description: `Shift ${id}`,
  });
}

export interface BuildShiftRequirementInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  shiftId: string;
  roleId: string;
  id?: string;
  peopleNeeded: number;
  sectorId: string;
  notes?: string;
}

export async function buildShiftRequirement({
  db,
  churchId,
  participationId,
  shiftId,
  roleId,
  id,
  peopleNeeded,
  sectorId,
  notes,
}: BuildShiftRequirementInput): Promise<SeededShiftRequirement> {
  return requireInsertedRow({
    rows: await db
      .insert(shiftRequirement)
      .values({
        id,
        churchId,
        participationId,
        shiftId,
        roleId,
        peopleNeeded,
        sectorId,
        notes,
      })
      .returning(),
    description: `Shift Requirement ${id}`,
  });
}

export interface BuildAssignmentInput {
  db: SeedWriter;
  churchId: string;
  participationId: string;
  shiftId: string;
  volunteerId: string;
  roleId: string;
  shiftRequirementId?: string;
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
  shiftRequirementId,
  id,
  status,
  reason,
  assignedAt,
  assignedBy,
}: BuildAssignmentInput): Promise<SeededAssignment> {
  const [requirementRow] = await db
    .select({
      id: shiftRequirement.id,
      participationId: shiftRequirement.participationId,
      shiftId: shiftRequirement.shiftId,
      roleId: shiftRequirement.roleId,
    })
    .from(shiftRequirement)
    .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
    .where(
      and(
        eq(shiftRequirement.id, shiftRequirementId ?? shiftRequirement.id),
        eq(shiftRequirement.churchId, churchId),
        eq(shiftRequirement.shiftId, shiftId),
        ...(shiftRequirementId ? [] : [eq(shiftRequirement.roleId, roleId)]),
      ),
    )
    .orderBy(asc(sector.name), asc(shiftRequirement.id))
    .limit(1);
  if (
    !requirementRow ||
    requirementRow.participationId !== participationId ||
    requirementRow.shiftId !== shiftId ||
    requirementRow.roleId !== roleId
  ) {
    throw new Error(
      `No matching ShiftRequirement for assignment on shift ${shiftId} and role ${roleId}`,
    );
  }
  return requireInsertedRow({
    rows: await db
      .insert(assignment)
      .values({
        id,
        churchId,
        participationId: requirementRow.participationId,
        shiftId: requirementRow.shiftId,
        volunteerId,
        roleId: requirementRow.roleId,
        shiftRequirementId: requirementRow.id,
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
  eventTimeBlock: SeededEventTimeBlock;
  shift: SeededShift;
  assignment: SeededAssignment;
}

/**
 * A Volunteer's Assignment on a Shift that covers its own Event Time Block over
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
  const eventTimeBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId,
    start,
    end,
  });
  const eventTimeBlockShift = await buildShift({
    db,
    churchId,
    participationId,
    eventTimeBlockId: eventTimeBlock.id,
    start,
    end,
  });
  const [participationRow] = await db
    .select({ ministryId: ministryParticipation.ministryId })
    .from(ministryParticipation)
    .where(eq(ministryParticipation.id, participationId));
  if (!participationRow) {
    throw new Error(`MinistryParticipation ${participationId} was not found`);
  }
  const [firstSector] = await db
    .select({ id: sector.id })
    .from(sector)
    .where(
      and(
        eq(sector.churchId, churchId),
        eq(sector.ministryId, participationRow.ministryId),
      ),
    )
    .orderBy(asc(sector.name), asc(sector.id))
    .limit(1);
  const targetSector =
    firstSector ??
    (await buildSector({
      db,
      churchId,
      ministryId: participationRow.ministryId,
      name: 'Geral',
    }));
  const requirement = await buildShiftRequirement({
    db,
    churchId,
    participationId,
    shiftId: eventTimeBlockShift.id,
    roleId,
    sectorId: targetSector.id,
    peopleNeeded: 1,
  });
  const booked = await buildAssignment({
    db,
    churchId,
    participationId,
    shiftId: eventTimeBlockShift.id,
    volunteerId,
    roleId,
    shiftRequirementId: requirement.id,
    status,
  });

  return {
    eventTimeBlock: eventTimeBlock,
    shift: eventTimeBlockShift,
    assignment: booked,
  };
}

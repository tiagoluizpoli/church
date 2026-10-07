import {
  assignment,
  assignmentAudit,
  event,
  eventTemplate,
  ministryParticipation,
  participationSlotInclusion,
  planningCycle,
  shift,
  slotRequirement,
  timeBlock,
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
  label?: string;
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
  /** Left to the column default (now) when a fixture does not care. */
  assignedAt?: Instant;
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
export type AuditAction = SeededAssignmentAudit['action'];
export type SeededEventTemplate = typeof eventTemplate.$inferSelect;
export type SeededTimeBlock = typeof timeBlock.$inferSelect;

export interface BuildAssignmentAuditInput {
  db: SeedWriter;
  churchId: string;
  assignmentId: string;
  actorId: string;
  action: AuditAction;
  id?: string;
  timestamp?: Instant;
}

export async function buildAssignmentAudit({
  db,
  churchId,
  assignmentId,
  actorId,
  action,
  id,
  timestamp,
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
        timestamp:
          timestamp === undefined ? undefined : toDate({ instant: timestamp }),
      })
      .returning(),
    description: `Assignment Audit for ${assignmentId}`,
  });
}

export interface EventTemplateBlockInput {
  label: string;
  /** `HH:mm`, as the `time` column stores it. */
  startTime: string;
  endTime: string;
  order: number;
}

export interface BuildEventTemplateInput {
  db: SeedWriter;
  churchId: string;
  name: string;
  weekday: number;
  blocks: EventTemplateBlockInput[];
  id?: string;
}

export interface BuiltEventTemplate {
  template: SeededEventTemplate;
  blocks: SeededTimeBlock[];
}

/** An Event Template with its ordered Time Blocks. */
export async function buildEventTemplate({
  db,
  churchId,
  name,
  weekday,
  blocks,
  id,
}: BuildEventTemplateInput): Promise<BuiltEventTemplate> {
  const template = requireInsertedRow({
    rows: await db
      .insert(eventTemplate)
      .values({ id, churchId, name, weekday })
      .returning(),
    description: `Event Template ${name}`,
  });

  const insertedBlocks =
    blocks.length === 0
      ? []
      : await db
          .insert(timeBlock)
          .values(
            blocks.map((block) => ({
              churchId,
              templateId: template.id,
              label: block.label,
              startTime: block.startTime,
              endTime: block.endTime,
              order: block.order,
            })),
          )
          .returning();

  return { template, blocks: insertedBlocks };
}

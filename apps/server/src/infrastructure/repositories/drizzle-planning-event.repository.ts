import { NotFoundError } from '@church/core';
import {
  assignment,
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  sector,
  shift,
  shiftRequirement,
  user,
  volunteer,
} from '@church/db';
import { fromDate, nowAsDate } from '@church/time';
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notInArray,
  type SQL,
  sql,
} from 'drizzle-orm';
import {
  AssignmentId,
  EventTimeBlockId,
  MinistryId,
  ShiftId,
  VolunteerId,
} from '../../domain/branded-ids';
import type {
  CreatePlanningEventInput,
  CreatePlanningEventTimeBlockInput,
  DeletePlanningEventInput,
  GetPlanningEventInput,
  ListCycleEventsInput,
  ListMoveClashCandidatesInput,
  ListMoveScopeAssignmentsInput,
  LockEventParticipationsInput,
  MoveEventTimeBlocksInput,
  PlanningEventRepository,
  SeededMinistry,
  SeedPlanningParticipationsInput,
  UpdatePlanningEventInput,
} from '../../domain/contracts/infrastructure/planning-event.repository';
import type {
  Event,
  EventWithEventTimeBlocks,
} from '../../domain/entities/event';
import type {
  MoveClashCandidate,
  MoveScopeAssignment,
} from '../../domain/services/event-move';
import { mapEvent } from '../mappers/event.mapper';
import { mapEventTimeBlock } from '../mappers/event-time-block.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

const ACTIVE_ASSIGNMENT_STATUSES = ['draft', 'pending', 'confirmed'] as const;

interface DrizzlePlanningEventRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzlePlanningEventRepository implements PlanningEventRepository {
  constructor({ db }: DrizzlePlanningEventRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async createEvent(input: CreatePlanningEventInput): Promise<Event> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .insert(event)
      .values({
        churchId: input.churchId,
        cycleId: input.cycleId,
        sourceTemplateId: input.sourceTemplateId ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start: input.start,
        end: input.end,
        status: input.status,
      })
      .returning();

    if (!row) {
      throw new Error('Planning event insert failed');
    }

    return mapEvent(row);
  }

  async updateEvent(input: UpdatePlanningEventInput): Promise<Event> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .update(event)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? null }
          : {}),
        ...(input.location !== undefined
          ? { location: input.location ?? null }
          : {}),
        ...(input.start !== undefined ? { start: input.start } : {}),
        ...(input.end !== undefined ? { end: input.end } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: nowAsDate(),
      })
      .where(
        and(
          eq(event.id, input.eventId),
          withChurchIsolation({ table: event, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }

    return mapEvent(row);
  }

  async deleteEvent(input: DeletePlanningEventInput): Promise<void> {
    if (!isValidUuid(input.eventId)) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .delete(event)
      .where(
        and(
          eq(event.id, input.eventId),
          withChurchIsolation({ table: event, churchId: input.churchId }),
        ),
      )
      .returning();

    if (!row) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }
  }

  async getEvent(input: GetPlanningEventInput): Promise<Event> {
    if (!isValidUuid(input.eventId)) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }

    const db = getClient({ db: this.db, tx: input.tx });
    const [row] = await db
      .select()
      .from(event)
      .where(
        and(
          eq(event.id, input.eventId),
          withChurchIsolation({ table: event, churchId: input.churchId }),
        ),
      );

    if (!row) {
      throw new NotFoundError(`Event not found: ${input.eventId}`);
    }

    return mapEvent(row);
  }

  async listCycleEvents(
    input: ListCycleEventsInput,
  ): Promise<EventWithEventTimeBlocks[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const eventRows = await db
      .select()
      .from(event)
      .where(
        and(
          eq(event.cycleId, input.cycleId),
          withChurchIsolation({ table: event, churchId: input.churchId }),
        ),
      )
      .orderBy(
        asc(event.start),
        asc(event.end),
        asc(event.title),
        asc(event.id),
      );

    return Promise.all(
      eventRows.map(async (eventRow) => {
        const eventTimeBlockRows = await db
          .select()
          .from(eventTimeBlock)
          .where(
            and(
              eq(eventTimeBlock.eventId, eventRow.id),
              withChurchIsolation({
                table: eventTimeBlock,
                churchId: input.churchId,
              }),
            ),
          )
          .orderBy(
            asc(eventTimeBlock.startTime),
            asc(eventTimeBlock.endTime),
            asc(eventTimeBlock.id),
          );

        const eventTimeBlocks = await Promise.all(
          eventTimeBlockRows.map(async (eventTimeBlockRow) => {
            const requirementRows = await db
              .select({
                requirement: shiftRequirement,
                sectorName: sector.name,
              })
              .from(shiftRequirement)
              .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
              .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
              .where(eq(shift.eventTimeBlockId, eventTimeBlockRow.id));

            return mapEventTimeBlock({
              row: eventTimeBlockRow,
              requirements: requirementRows.map(({ requirement, sectorName }) =>
                mapShiftRequirement({
                  row: requirement,
                  sectorName,
                  eventTimeBlockId: eventTimeBlockRow.id,
                }),
              ),
            });
          }),
        );

        return {
          event: mapEvent(eventRow),
          eventTimeBlocks,
        };
      }),
    );
  }

  async createEventTimeBlock(
    input: CreatePlanningEventTimeBlockInput,
  ): Promise<EventTimeBlockId> {
    const db = getClient({ db: this.db, tx: input.tx });
    const [eventTimeBlockRow] = await db
      .insert(eventTimeBlock)
      .values({
        churchId: input.churchId,
        eventId: input.eventId,
        sourceTemplateTimeBlockId: input.sourceTemplateTimeBlockId ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        label: input.label ?? null,
      })
      .returning();

    if (!eventTimeBlockRow) {
      throw new Error('Planning event time block insert failed');
    }

    return eventTimeBlockRow.id as EventTimeBlockId;
  }

  async seedParticipations(
    input: SeedPlanningParticipationsInput,
  ): Promise<SeededMinistry[]> {
    const db = getClient({ db: this.db, tx: input.tx });
    const ministries = await db
      .select({ id: ministry.id, name: ministry.name })
      .from(ministry)
      .where(
        and(
          withChurchIsolation({ table: ministry, churchId: input.churchId }),
          isNull(ministry.deletedAt),
        ),
      )
      // Serializes with a concurrent archive (see `MinistryRepository.lockActive`).
      .for('share');

    if (ministries.length === 0) {
      return [];
    }

    // A Sent Cycle's Ministry already has a Schedule stage: join it, so the
    // new participation is not stranded in `preparing`.
    const existing = await db
      .select({
        ministryId: ministryParticipation.ministryId,
        state: ministryParticipation.state,
      })
      .from(ministryParticipation)
      .innerJoin(event, eq(event.id, ministryParticipation.eventId))
      .where(
        and(
          withChurchIsolation({
            table: ministryParticipation,
            churchId: input.churchId,
          }),
          eq(event.cycleId, input.cycleId),
        ),
      );

    await db.insert(ministryParticipation).values(
      ministries.map((ministryRow) => ({
        churchId: input.churchId,
        ministryId: ministryRow.id,
        eventId: input.eventId,
        state: furthestBehindState({
          states: existing
            .filter((row) => row.ministryId === ministryRow.id)
            .map((row) => row.state),
        }),
      })),
    );
    return ministries.map((row) => ({
      id: row.id as MinistryId,
      name: row.name,
    }));
  }

  async listMoveScopeAssignments({
    churchId,
    eventId,
    eventTimeBlockId,
    tx,
  }: ListMoveScopeAssignmentsInput): Promise<MoveScopeAssignment[]> {
    const conditions: SQL[] = [
      withChurchIsolation({ table: assignment, churchId }),
      eq(eventTimeBlock.eventId, eventId),
      inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
    ];
    if (eventTimeBlockId) {
      conditions.push(eq(eventTimeBlock.id, eventTimeBlockId));
    }
    const rows = await getClient({ db: this.db, tx })
      .select({
        assignmentId: assignment.id,
        eventTimeBlockId: shift.eventTimeBlockId,
        shiftId: shift.id,
        volunteerId: assignment.volunteerId,
        volunteerName: user.name,
        ministryId: ministry.id,
        ministryName: ministry.name,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .innerJoin(eventTimeBlock, eq(eventTimeBlock.id, shift.eventTimeBlockId))
      .innerJoin(volunteer, eq(volunteer.id, assignment.volunteerId))
      .innerJoin(user, eq(user.id, volunteer.userId))
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.id, assignment.participationId),
      )
      .innerJoin(ministry, eq(ministry.id, ministryParticipation.ministryId))
      .where(and(...conditions))
      .orderBy(asc(shift.startTime), asc(assignment.id));

    return rows.map((row) => ({
      assignmentId: AssignmentId.from(row.assignmentId),
      eventTimeBlockId: EventTimeBlockId.from(row.eventTimeBlockId),
      shiftId: ShiftId.from(row.shiftId),
      volunteerId: VolunteerId.from(row.volunteerId),
      volunteerName: row.volunteerName,
      ministryId: MinistryId.from(row.ministryId),
      ministryName: row.ministryName,
      shiftStart: fromDate({ date: row.shiftStart }),
      shiftEnd: fromDate({ date: row.shiftEnd }),
    }));
  }

  async listMoveClashCandidates({
    churchId,
    volunteerIds,
    excludedEventTimeBlockIds,
    startTime,
    endTime,
    tx,
  }: ListMoveClashCandidatesInput): Promise<MoveClashCandidate[]> {
    if (volunteerIds.length === 0) return [];
    const conditions: SQL[] = [
      withChurchIsolation({ table: assignment, churchId }),
      inArray(assignment.volunteerId, volunteerIds),
      inArray(assignment.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
      // Strict overlap: back-to-back Shifts are compatible.
      lt(shift.startTime, endTime),
      gt(shift.endTime, startTime),
    ];
    if (excludedEventTimeBlockIds.length > 0) {
      conditions.push(
        notInArray(shift.eventTimeBlockId, excludedEventTimeBlockIds),
      );
    }
    const rows = await getClient({ db: this.db, tx })
      .select({
        volunteerId: assignment.volunteerId,
        shiftStart: shift.startTime,
        shiftEnd: shift.endTime,
      })
      .from(assignment)
      .innerJoin(shift, eq(shift.id, assignment.shiftId))
      .where(and(...conditions));

    return rows.map((row) => ({
      volunteerId: VolunteerId.from(row.volunteerId),
      shiftStart: fromDate({ date: row.shiftStart }),
      shiftEnd: fromDate({ date: row.shiftEnd }),
    }));
  }

  async lockParticipations({
    churchId,
    eventId,
    tx,
  }: LockEventParticipationsInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .select({ id: ministryParticipation.id })
      .from(ministryParticipation)
      .where(
        and(
          withChurchIsolation({ table: ministryParticipation, churchId }),
          eq(ministryParticipation.eventId, eventId),
        ),
      )
      .orderBy(asc(ministryParticipation.id))
      .for('no key update');
  }

  async moveEventTimeBlocks({
    churchId,
    eventTimeBlockIds,
    deltaMs,
    tx,
  }: MoveEventTimeBlocksInput): Promise<void> {
    if (eventTimeBlockIds.length === 0) return;
    const client = getClient({ db: this.db, tx });
    const delta = sql`(${deltaMs} * interval '1 millisecond')`;
    await client
      .update(eventTimeBlock)
      .set({
        startTime: sql`${eventTimeBlock.startTime} + ${delta}`,
        endTime: sql`${eventTimeBlock.endTime} + ${delta}`,
      })
      .where(
        and(
          withChurchIsolation({ table: eventTimeBlock, churchId }),
          inArray(eventTimeBlock.id, eventTimeBlockIds),
        ),
      );
    await client
      .update(shift)
      .set({
        startTime: sql`${shift.startTime} + ${delta}`,
        endTime: sql`${shift.endTime} + ${delta}`,
      })
      .where(
        and(
          withChurchIsolation({ table: shift, churchId }),
          inArray(shift.eventTimeBlockId, eventTimeBlockIds),
        ),
      );
  }
}

const STATES_FURTHEST_BEHIND_FIRST = [
  'preparing',
  'availability_requested',
  'assigning',
  'published',
] as const;

interface FurthestBehindStateInput {
  states: (typeof STATES_FURTHEST_BEHIND_FIRST)[number][];
}

function furthestBehindState({ states }: FurthestBehindStateInput) {
  return (
    STATES_FURTHEST_BEHIND_FIRST.find((state) => states.includes(state)) ??
    'preparing'
  );
}

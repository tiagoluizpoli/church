import { NotFoundError } from '@church/core';
import {
  assignment,
  eventTimeBlock,
  ministryParticipation,
  sector,
  shift,
  shiftRequirement,
} from '@church/db';
import { and, count, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type {
  CountActiveAssignmentsInput,
  CreateEventTimeBlockRepositoryInput,
  EventTimeBlockRepository,
  EventTimeBlocksByEventInput,
  FindOverlappingEventTimeBlocksInput,
  GetEventTimeBlockInput,
  UpdateEventTimeBlockRepositoryInput,
} from '../../domain/contracts/infrastructure/event-time-block.repository';
import type { EventTimeBlock } from '../../domain/entities/event-time-block';
import { mapEventTimeBlock } from '../mappers/event-time-block.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleEventTimeBlockRepositoryInput {
  db: AnyDrizzleDb;
}

interface FetchWithRequirementsInput {
  db: AnyDrizzleDb;
  eventTimeBlockRow: typeof eventTimeBlock.$inferSelect;
}

export class DrizzleEventTimeBlockRepository
  implements EventTimeBlockRepository
{
  constructor({ db }: DrizzleEventTimeBlockRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async fetchWithRequirements({
    db,
    eventTimeBlockRow,
  }: FetchWithRequirementsInput): Promise<EventTimeBlock> {
    const reqRows = await db
      .select({ requirement: shiftRequirement, sectorName: sector.name })
      .from(shiftRequirement)
      .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
      .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
      .where(eq(shift.eventTimeBlockId, eventTimeBlockRow.id));
    return mapEventTimeBlock({
      row: eventTimeBlockRow,
      requirements: reqRows.map(({ requirement, sectorName }) =>
        mapShiftRequirement({
          row: requirement,
          sectorName,
          eventTimeBlockId: eventTimeBlockRow.id,
        }),
      ),
    });
  }

  async getById({
    churchId,
    eventTimeBlockId,
    tx,
  }: GetEventTimeBlockInput): Promise<EventTimeBlock> {
    if (!isValidUuid(eventTimeBlockId)) {
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.id, eventTimeBlockId),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      );
    if (!row)
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    return this.fetchWithRequirements({ db, eventTimeBlockRow: row });
  }

  async listByEvent({
    churchId,
    eventId,
    tx,
  }: EventTimeBlocksByEventInput): Promise<EventTimeBlock[]> {
    const db = getClient({ db: this.db, tx });
    const rows = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, eventId),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      );
    return Promise.all(
      rows.map((r) => this.fetchWithRequirements({ db, eventTimeBlockRow: r })),
    );
  }

  async create({
    churchId,
    input,
    tx,
  }: CreateEventTimeBlockRepositoryInput): Promise<EventTimeBlock> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .insert(eventTimeBlock)
      .values({
        churchId,
        eventId: input.eventId,
        startTime: input.startTime,
        endTime: input.endTime,
        label: input.label ?? null,
      })
      .returning();
    if (!row) throw new Error('EventTimeBlock insert failed');
    const participations = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation({ table: ministryParticipation, churchId }),
        ),
      );
    if (participations.length) {
      await db.insert(shift).values(
        participations.map((participation) => ({
          churchId,
          participationId: participation.id,
          eventTimeBlockId: row.id,
          startTime: row.startTime,
          endTime: row.endTime,
          label: row.label,
        })),
      );
    }
    return mapEventTimeBlock({ row, requirements: [] });
  }

  async update({
    churchId,
    eventTimeBlockId,
    input,
    tx,
  }: UpdateEventTimeBlockRepositoryInput): Promise<EventTimeBlock> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .update(eventTimeBlock)
      .set({
        ...(input.startTime !== undefined
          ? { startTime: input.startTime }
          : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.label !== undefined ? { label: input.label ?? null } : {}),
      })
      .where(
        and(
          eq(eventTimeBlock.id, eventTimeBlockId),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      )
      .returning();
    if (!row)
      throw new NotFoundError(`EventTimeBlock not found: ${eventTimeBlockId}`);
    return this.fetchWithRequirements({ db, eventTimeBlockRow: row });
  }

  async deleteById({
    churchId,
    eventTimeBlockId,
    tx,
  }: GetEventTimeBlockInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .delete(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.id, eventTimeBlockId),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      );
  }

  async findOverlapping({
    churchId,
    eventId,
    startTime,
    endTime,
    excludeEventTimeBlockId,
    tx,
  }: FindOverlappingEventTimeBlocksInput): Promise<EventTimeBlock[]> {
    const db = getClient({ db: this.db, tx });
    const conditions = [
      withChurchIsolation({ table: eventTimeBlock, churchId }),
      eq(eventTimeBlock.eventId, eventId),
      // overlap: existing.start < new.end AND existing.end > new.start
      lt(eventTimeBlock.startTime, endTime),
      gt(eventTimeBlock.endTime, startTime),
    ];
    if (excludeEventTimeBlockId)
      conditions.push(ne(eventTimeBlock.id, excludeEventTimeBlockId));
    const rows = await db
      .select()
      .from(eventTimeBlock)
      .where(and(...conditions));
    return rows.map((r) => mapEventTimeBlock({ row: r, requirements: [] }));
  }

  async deleteByEvent({
    churchId,
    eventId,
    tx,
  }: EventTimeBlocksByEventInput): Promise<void> {
    await getClient({ db: this.db, tx })
      .delete(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, eventId),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      );
  }

  async countActiveAssignments({
    churchId,
    eventTimeBlockId,
    roleId,
    tx,
  }: CountActiveAssignmentsInput): Promise<number> {
    const db = getClient({ db: this.db, tx });
    const [result] = await db
      .select({ cnt: count() })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          withChurchIsolation({ table: assignment, churchId }),
          eq(shift.eventTimeBlockId, eventTimeBlockId),
          eq(assignment.roleId, roleId),
          inArray(assignment.status, ['pending', 'confirmed']),
        ),
      );
    return result?.cnt ?? 0;
  }
}

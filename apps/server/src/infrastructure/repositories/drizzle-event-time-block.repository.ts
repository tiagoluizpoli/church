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
  ChurchId,
  EventId,
  EventTimeBlockId,
  RoleId,
} from '../../domain/branded-ids';
import type {
  CreateEventTimeBlockInput,
  EventTimeBlockRepository,
  UpdateEventTimeBlockInput,
} from '../../domain/contracts/infrastructure/event-time-block.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { EventTimeBlock } from '../../domain/entities/event-time-block';
import { mapEventTimeBlock } from '../mappers/event-time-block.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleEventTimeBlockRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleEventTimeBlockRepository
  implements EventTimeBlockRepository
{
  constructor({ db }: DrizzleEventTimeBlockRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  private async fetchWithRequirements(
    db: AnyDrizzleDb,
    eventTimeBlockRow: typeof eventTimeBlock.$inferSelect,
  ): Promise<EventTimeBlock> {
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

  async getById(
    churchId: ChurchId,
    id: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`EventTimeBlock not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.id, id),
          withChurchIsolation(eventTimeBlock, churchId),
        ),
      );
    if (!row) throw new NotFoundError(`EventTimeBlock not found: ${id}`);
    return this.fetchWithRequirements(db, row);
  }

  async listByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock[]> {
    const db = getClient(this.db, tx);
    const rows = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, eventId),
          withChurchIsolation(eventTimeBlock, churchId),
        ),
      );
    return Promise.all(rows.map((r) => this.fetchWithRequirements(db, r)));
  }

  async create(
    churchId: ChurchId,
    input: CreateEventTimeBlockInput,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock> {
    const db = getClient(this.db, tx);
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
          withChurchIsolation(ministryParticipation, churchId),
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

  async update(
    churchId: ChurchId,
    id: EventTimeBlockId,
    input: UpdateEventTimeBlockInput,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock> {
    const db = getClient(this.db, tx);
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
          eq(eventTimeBlock.id, id),
          withChurchIsolation(eventTimeBlock, churchId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundError(`EventTimeBlock not found: ${id}`);
    return this.fetchWithRequirements(db, row);
  }

  async deleteById(
    churchId: ChurchId,
    id: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.id, id),
          withChurchIsolation(eventTimeBlock, churchId),
        ),
      );
  }

  async findOverlapping(
    churchId: ChurchId,
    eventId: EventId,
    startTime: Date,
    endTime: Date,
    excludeEventTimeBlockId?: EventTimeBlockId,
    tx?: TransactionContext,
  ): Promise<EventTimeBlock[]> {
    const db = getClient(this.db, tx);
    const conditions = [
      withChurchIsolation(eventTimeBlock, churchId),
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

  async deleteByEvent(
    churchId: ChurchId,
    eventId: EventId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, eventId),
          withChurchIsolation(eventTimeBlock, churchId),
        ),
      );
  }

  async countActiveAssignments(
    churchId: ChurchId,
    eventTimeBlockId: EventTimeBlockId,
    roleId: RoleId,
    tx?: TransactionContext,
  ): Promise<number> {
    const db = getClient(this.db, tx);
    const [result] = await db
      .select({ cnt: count() })
      .from(assignment)
      .innerJoin(shift, eq(assignment.shiftId, shift.id))
      .where(
        and(
          withChurchIsolation(assignment, churchId),
          eq(shift.eventTimeBlockId, eventTimeBlockId),
          eq(assignment.roleId, roleId),
          inArray(assignment.status, ['pending', 'confirmed']),
        ),
      );
    return result?.cnt ?? 0;
  }
}

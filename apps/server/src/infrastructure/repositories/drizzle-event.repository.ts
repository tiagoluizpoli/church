import { NotFoundError } from '@church/core';
import {
  event,
  eventTimeBlock,
  ministryParticipation,
  sector,
  shift,
  shiftRequirement,
} from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, eq } from 'drizzle-orm';
import type { ChurchId, EventId, MinistryId } from '../../domain/branded-ids';
import type {
  CreateEventInput,
  EventRepository,
  UpdateEventInput,
  UpdateEventStatusInput,
} from '../../domain/contracts/infrastructure/event.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type {
  Event,
  EventStatus,
  EventWithEventTimeBlocks,
} from '../../domain/entities/event';
import { mapEvent } from '../mappers/event.mapper';
import { mapEventTimeBlock } from '../mappers/event-time-block.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleEventRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleEventRepository implements EventRepository {
  constructor({ db }: DrizzleEventRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async getMinistryId(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<MinistryId> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ ministryId: ministryParticipation.ministryId })
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, id),
          withChurchIsolation({ table: ministryParticipation, churchId }),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError(`Event participation not found: ${id}`);
    return row.ministryId as MinistryId;
  }

  async getById(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<Event> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Event not found: ${id}`);
    }
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .select()
      .from(event)
      .where(
        and(eq(event.id, id), withChurchIsolation({ table: event, churchId })),
      );
    if (!row) throw new NotFoundError(`Event not found: ${id}`);
    return mapEvent(row);
  }

  async getWithEventTimeBlocks(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<EventWithEventTimeBlocks> {
    const db = getClient({ db: this.db, tx });
    const ev = await this.getById(churchId, id, tx);

    const eventTimeBlockRows = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, id),
          withChurchIsolation({ table: eventTimeBlock, churchId }),
        ),
      );

    const eventTimeBlocks = await Promise.all(
      eventTimeBlockRows.map(async (eventTimeBlockRow) => {
        const reqRows = await db
          .select({ requirement: shiftRequirement, sectorName: sector.name })
          .from(shiftRequirement)
          .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
          .innerJoin(sector, eq(sector.id, shiftRequirement.sectorId))
          .where(eq(shift.eventTimeBlockId, eventTimeBlockRow.id));
        const requirements = reqRows.map(({ requirement, sectorName }) =>
          mapShiftRequirement({
            row: requirement,
            sectorName,
            eventTimeBlockId: eventTimeBlockRow.id,
          }),
        );
        return mapEventTimeBlock(eventTimeBlockRow, requirements);
      }),
    );

    return { event: ev, eventTimeBlocks };
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    status?: EventStatus,
    tx?: TransactionContext,
  ): Promise<Event[]> {
    const db = getClient({ db: this.db, tx });
    const conditions = [
      withChurchIsolation({ table: event, churchId }),
      eq(ministryParticipation.ministryId, ministryId),
    ];
    if (status != null) conditions.push(eq(event.status, status));
    const rows = await db
      .select()
      .from(event)
      .innerJoin(
        ministryParticipation,
        eq(ministryParticipation.eventId, event.id),
      )
      .where(and(...conditions))
      .orderBy(asc(event.start));
    return rows.map(({ event: row }) => mapEvent(row));
  }

  async create(
    churchId: ChurchId,
    input: CreateEventInput,
    tx?: TransactionContext,
  ): Promise<Event> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .insert(event)
      .values({
        churchId,
        cycleId: input.cycleId,
        sourceTemplateId: input.sourceTemplateId ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start: input.start,
        end: input.end,
        status: input.status ?? 'draft',
      })
      .returning();
    if (!row) throw new Error('Event insert failed');
    return mapEvent(row);
  }

  async update(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventInput,
    tx?: TransactionContext,
  ): Promise<Event> {
    const db = getClient({ db: this.db, tx });
    const [row] = await db
      .update(event)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.start !== undefined ? { start: input.start } : {}),
        ...(input.end !== undefined ? { end: input.end } : {}),
        updatedAt: nowAsDate(),
      })
      .where(
        and(eq(event.id, id), withChurchIsolation({ table: event, churchId })),
      )
      .returning();
    if (!row) throw new NotFoundError(`Event not found: ${id}`);
    return mapEvent(row);
  }

  async updateStatus(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventStatusInput,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient({ db: this.db, tx })
      .update(event)
      .set({
        status: input.status,
        updatedAt: nowAsDate(),
      })
      .where(
        and(eq(event.id, id), withChurchIsolation({ table: event, churchId })),
      );
  }
}

import { NotFoundError } from '@church/core';
import { event, slotRequirement, timeSlot } from '@church/db';
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
  EventWithSlots,
} from '../../domain/entities/event';
import { mapEvent } from '../mappers/event.mapper';
import { mapSlotRequirement, mapTimeSlot } from '../mappers/slot.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzleEventRepository implements EventRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async getById(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<Event> {
    if (!isValidUuid(id)) {
      throw new NotFoundError(`Event not found: ${id}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, id), withChurchIsolation(event, churchId)));
    if (!row) throw new NotFoundError(`Event not found: ${id}`);
    return mapEvent(row);
  }

  async getWithSlots(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<EventWithSlots> {
    const db = getClient(this.db, tx);
    const ev = await this.getById(churchId, id, tx);

    const slotRows = await db
      .select()
      .from(timeSlot)
      .where(
        and(eq(timeSlot.eventId, id), withChurchIsolation(timeSlot, churchId)),
      );

    const slots = await Promise.all(
      slotRows.map(async (slotRow) => {
        const reqRows = await db
          .select()
          .from(slotRequirement)
          .where(eq(slotRequirement.slotId, slotRow.id));
        const requirements = reqRows.map(mapSlotRequirement);
        return mapTimeSlot(slotRow, requirements);
      }),
    );

    return { event: ev, slots };
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    status?: EventStatus,
    tx?: TransactionContext,
  ): Promise<Event[]> {
    const db = getClient(this.db, tx);
    const conditions = [
      withChurchIsolation(event, churchId),
      eq(event.ministryId, ministryId),
    ];
    if (status != null)
      conditions.push(
        eq(event.status, status as 'draft' | 'published' | 'cancelled'),
      );
    const rows = await db
      .select()
      .from(event)
      .where(and(...conditions))
      .orderBy(asc(event.startDate));
    return rows.map(mapEvent);
  }

  async create(
    churchId: ChurchId,
    input: CreateEventInput,
    tx?: TransactionContext,
  ): Promise<Event> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .insert(event)
      .values({
        churchId,
        ministryId: input.ministryId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        status: (input.status ?? 'draft') as
          | 'draft'
          | 'published'
          | 'cancelled',
        eventType: (input.eventType ?? 'hourly') as 'hourly' | 'day_based',
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
    const db = getClient(this.db, tx);
    const [row] = await db
      .update(event)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate }
          : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(event.id, id), withChurchIsolation(event, churchId)))
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
    await getClient(this.db, tx)
      .update(event)
      .set({
        status: input.status as 'draft' | 'published' | 'cancelled',
        updatedAt: new Date(),
      })
      .where(and(eq(event.id, id), withChurchIsolation(event, churchId)));
  }
}

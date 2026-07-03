import { NotFoundError } from '@church/core';
import {
  event,
  ministryParticipation,
  shift,
  slotRequirement,
  timeSlot,
} from '@church/db';
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

  async getMinistryId(
    churchId: ChurchId,
    id: EventId,
    tx?: TransactionContext,
  ): Promise<MinistryId> {
    const [row] = await getClient(this.db, tx)
      .select({ ministryId: ministryParticipation.ministryId })
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, id),
          withChurchIsolation(ministryParticipation, churchId),
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
          .select({ requirement: slotRequirement })
          .from(slotRequirement)
          .innerJoin(shift, eq(shift.id, slotRequirement.shiftId))
          .where(eq(shift.timeSlotId, slotRow.id));
        const requirements = reqRows.map(({ requirement }) =>
          mapSlotRequirement(requirement, slotRow.id),
        );
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
      .orderBy(asc(event.startDate));
    return rows.map(({ event: row }) => mapEvent(row));
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
        planningCycleId: input.planningCycleId,
        sourceTemplateId: input.sourceTemplateId ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status ?? 'draft',
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
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(event.id, id), withChurchIsolation(event, churchId)));
  }
}

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
import type { MinistryId } from '../../domain/branded-ids';
import type {
  CreateEventRepositoryInput,
  EventRepository,
  GetEventInput,
  ListEventsByMinistryInput,
  UpdateEventRepositoryInput,
  UpdateEventStatusRepositoryInput,
} from '../../domain/contracts/infrastructure/event.repository';
import type {
  Event,
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

  async getMinistryId({
    churchId,
    eventId,
    tx,
  }: GetEventInput): Promise<MinistryId> {
    const [row] = await getClient(this.db, tx)
      .select({ ministryId: ministryParticipation.ministryId })
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, eventId),
          withChurchIsolation(ministryParticipation, churchId),
        ),
      )
      .limit(1);
    if (!row)
      throw new NotFoundError(`Event participation not found: ${eventId}`);
    return row.ministryId as MinistryId;
  }

  async getById({ churchId, eventId, tx }: GetEventInput): Promise<Event> {
    if (!isValidUuid(eventId)) {
      throw new NotFoundError(`Event not found: ${eventId}`);
    }
    const db = getClient(this.db, tx);
    const [row] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), withChurchIsolation(event, churchId)));
    if (!row) throw new NotFoundError(`Event not found: ${eventId}`);
    return mapEvent(row);
  }

  async getWithEventTimeBlocks({
    churchId,
    eventId,
    tx,
  }: GetEventInput): Promise<EventWithEventTimeBlocks> {
    const db = getClient(this.db, tx);
    const ev = await this.getById({ churchId, eventId, tx });

    const eventTimeBlockRows = await db
      .select()
      .from(eventTimeBlock)
      .where(
        and(
          eq(eventTimeBlock.eventId, eventId),
          withChurchIsolation(eventTimeBlock, churchId),
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

  async listByMinistry({
    churchId,
    ministryId,
    status,
    tx,
  }: ListEventsByMinistryInput): Promise<Event[]> {
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
      .orderBy(asc(event.start));
    return rows.map(({ event: row }) => mapEvent(row));
  }

  async create({
    churchId,
    input,
    tx,
  }: CreateEventRepositoryInput): Promise<Event> {
    const db = getClient(this.db, tx);
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

  async update({
    churchId,
    eventId,
    input,
    tx,
  }: UpdateEventRepositoryInput): Promise<Event> {
    const db = getClient(this.db, tx);
    const [row] = await db
      .update(event)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.start !== undefined ? { start: input.start } : {}),
        ...(input.end !== undefined ? { end: input.end } : {}),
        updatedAt: nowAsDate(),
      })
      .where(and(eq(event.id, eventId), withChurchIsolation(event, churchId)))
      .returning();
    if (!row) throw new NotFoundError(`Event not found: ${eventId}`);
    return mapEvent(row);
  }

  async updateStatus({
    churchId,
    eventId,
    input,
    tx,
  }: UpdateEventStatusRepositoryInput): Promise<void> {
    await getClient(this.db, tx)
      .update(event)
      .set({
        status: input.status,
        updatedAt: nowAsDate(),
      })
      .where(and(eq(event.id, eventId), withChurchIsolation(event, churchId)));
  }
}

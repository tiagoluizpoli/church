import { NotFoundError } from '@church/core';
import {
  event,
  eventTimeBlock,
  ministry,
  ministryParticipation,
  shift,
  shiftRequirement,
} from '@church/db';
import { nowAsDate } from '@church/time';
import { and, asc, eq } from 'drizzle-orm';
import type { EventTimeBlockId } from '../../domain/branded-ids';
import type {
  CreatePlanningEventInput,
  CreatePlanningEventTimeBlockInput,
  DeletePlanningEventInput,
  GetPlanningEventInput,
  ListCycleEventsInput,
  PlanningEventRepository,
  SeedPlanningParticipationsInput,
  UpdatePlanningEventInput,
} from '../../domain/contracts/infrastructure/planning-event.repository';
import type {
  Event,
  EventWithEventTimeBlocks,
} from '../../domain/entities/event';
import { mapEvent } from '../mappers/event.mapper';
import { mapEventTimeBlock } from '../mappers/event-time-block.mapper';
import { mapShiftRequirement } from '../mappers/shift-requirement.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzlePlanningEventRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzlePlanningEventRepository implements PlanningEventRepository {
  constructor({ db }: DrizzlePlanningEventRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async createEvent(input: CreatePlanningEventInput): Promise<Event> {
    const db = getClient(this.db, input.tx);
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
    const db = getClient(this.db, input.tx);
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
          withChurchIsolation(event, input.churchId),
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

    const db = getClient(this.db, input.tx);
    const [row] = await db
      .delete(event)
      .where(
        and(
          eq(event.id, input.eventId),
          withChurchIsolation(event, input.churchId),
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

    const db = getClient(this.db, input.tx);
    const [row] = await db
      .select()
      .from(event)
      .where(
        and(
          eq(event.id, input.eventId),
          withChurchIsolation(event, input.churchId),
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
    const db = getClient(this.db, input.tx);
    const eventRows = await db
      .select()
      .from(event)
      .where(
        and(
          eq(event.cycleId, input.cycleId),
          withChurchIsolation(event, input.churchId),
        ),
      )
      .orderBy(asc(event.start));

    return Promise.all(
      eventRows.map(async (eventRow) => {
        const eventTimeBlockRows = await db
          .select()
          .from(eventTimeBlock)
          .where(
            and(
              eq(eventTimeBlock.eventId, eventRow.id),
              withChurchIsolation(eventTimeBlock, input.churchId),
            ),
          )
          .orderBy(asc(eventTimeBlock.startTime));

        const eventTimeBlocks = await Promise.all(
          eventTimeBlockRows.map(async (eventTimeBlockRow) => {
            const requirementRows = await db
              .select({ requirement: shiftRequirement })
              .from(shiftRequirement)
              .innerJoin(shift, eq(shift.id, shiftRequirement.shiftId))
              .where(eq(shift.eventTimeBlockId, eventTimeBlockRow.id));

            return mapEventTimeBlock(
              eventTimeBlockRow,
              requirementRows.map(({ requirement }) =>
                mapShiftRequirement(requirement, eventTimeBlockRow.id),
              ),
            );
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
    const db = getClient(this.db, input.tx);
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
  ): Promise<void> {
    const db = getClient(this.db, input.tx);
    const ministries = await db
      .select({ id: ministry.id })
      .from(ministry)
      .where(withChurchIsolation(ministry, input.churchId));

    if (ministries.length === 0) {
      return;
    }

    await db.insert(ministryParticipation).values(
      ministries.map((ministryRow) => ({
        churchId: input.churchId,
        ministryId: ministryRow.id,
        eventId: input.eventId,
      })),
    );
  }
}

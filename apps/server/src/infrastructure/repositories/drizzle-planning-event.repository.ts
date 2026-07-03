import { NotFoundError } from '@church/core';
import {
  event,
  ministry,
  ministryParticipation,
  shift,
  slotRequirement,
  timeSlot,
} from '@church/db';
import { and, asc, eq } from 'drizzle-orm';
import type { TimeSlotId } from '../../domain/branded-ids';
import type {
  CreatePlanningEventInput,
  CreatePlanningTimeSlotInput,
  GetPlanningEventInput,
  ListPlanningCycleEventsInput,
  PlanningEventRepository,
  SeedPlanningParticipationsInput,
  UpdatePlanningEventInput,
} from '../../domain/contracts/infrastructure/planning-event.repository';
import type { Event, EventWithSlots } from '../../domain/entities/event';
import { mapEvent } from '../mappers/event.mapper';
import { mapSlotRequirement, mapTimeSlot } from '../mappers/slot.mapper';
import { getClient, isValidUuid, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

export class DrizzlePlanningEventRepository implements PlanningEventRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async createEvent(input: CreatePlanningEventInput): Promise<Event> {
    const db = getClient(this.db, input.tx);
    const [row] = await db
      .insert(event)
      .values({
        churchId: input.churchId,
        planningCycleId: input.planningCycleId,
        sourceTemplateId: input.sourceTemplateId ?? null,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
        eventType: input.eventType,
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
        ...(input.startDate !== undefined
          ? { startDate: input.startDate }
          : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
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
    input: ListPlanningCycleEventsInput,
  ): Promise<EventWithSlots[]> {
    const db = getClient(this.db, input.tx);
    const eventRows = await db
      .select()
      .from(event)
      .where(
        and(
          eq(event.planningCycleId, input.cycleId),
          withChurchIsolation(event, input.churchId),
        ),
      )
      .orderBy(asc(event.startDate));

    return Promise.all(
      eventRows.map(async (eventRow) => {
        const slotRows = await db
          .select()
          .from(timeSlot)
          .where(
            and(
              eq(timeSlot.eventId, eventRow.id),
              withChurchIsolation(timeSlot, input.churchId),
            ),
          )
          .orderBy(asc(timeSlot.startTime));

        const slots = await Promise.all(
          slotRows.map(async (slotRow) => {
            const requirementRows = await db
              .select({ requirement: slotRequirement })
              .from(slotRequirement)
              .innerJoin(shift, eq(shift.id, slotRequirement.shiftId))
              .where(eq(shift.timeSlotId, slotRow.id));

            return mapTimeSlot(
              slotRow,
              requirementRows.map(({ requirement }) =>
                mapSlotRequirement(requirement, slotRow.id),
              ),
            );
          }),
        );

        return {
          event: mapEvent(eventRow),
          slots,
        };
      }),
    );
  }

  async createTimeSlot(
    input: CreatePlanningTimeSlotInput,
  ): Promise<TimeSlotId> {
    const db = getClient(this.db, input.tx);
    const [slotRow] = await db
      .insert(timeSlot)
      .values({
        churchId: input.churchId,
        eventId: input.eventId,
        sourceTemplateBlockId: input.sourceTemplateBlockId ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        label: input.label ?? null,
      })
      .returning();

    if (!slotRow) {
      throw new Error('Planning slot insert failed');
    }

    const participations = await db
      .select()
      .from(ministryParticipation)
      .where(
        and(
          eq(ministryParticipation.eventId, input.eventId),
          withChurchIsolation(ministryParticipation, input.churchId),
        ),
      );

    if (participations.length > 0) {
      await db.insert(shift).values(
        participations.map((participation) => ({
          churchId: input.churchId,
          participationId: participation.id,
          timeSlotId: slotRow.id,
          startTime: slotRow.startTime,
          endTime: slotRow.endTime,
          label: slotRow.label,
        })),
      );
    }

    return slotRow.id as TimeSlotId;
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

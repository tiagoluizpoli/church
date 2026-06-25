import { availability } from '@church/db';
import { and, between, eq, inArray } from 'drizzle-orm';
import type {
  Availability,
  AvailabilityId,
} from '../../domain/entities/availability';
import type { ChurchId } from '../../domain/entities/church';
import type { VolunteerId } from '../../domain/entities/volunteer';
import type {
  AvailabilityRepository,
  CreateAvailabilityInput,
  UpdateAvailabilityInput,
} from '../../domain/repositories/availability.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, withChurchIsolation } from './helpers';
import { mapAvailability } from './mappers';
import type { AnyDrizzleDb } from './types';

export class DrizzleAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    const rows = await getClient(this.db, tx)
      .select()
      .from(availability)
      .where(
        and(
          withChurchIsolation(availability, churchId),
          eq(availability.volunteerId, volunteerId),
          between(availability.startTime, startTime, endTime),
        ),
      );
    return rows.map(mapAvailability);
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
    tx?: TransactionContext,
  ): Promise<Availability[]> {
    if (volunteerIds.length === 0) return [];
    const rows = await getClient(this.db, tx)
      .select()
      .from(availability)
      .where(
        and(
          withChurchIsolation(availability, churchId),
          inArray(availability.volunteerId, volunteerIds),
          eq(availability.type, 'unavailable'),
        ),
      );
    return rows.map(mapAvailability);
  }

  async create(
    churchId: ChurchId,
    input: CreateAvailabilityInput,
    tx?: TransactionContext,
  ): Promise<Availability> {
    const [row] = await getClient(this.db, tx)
      .insert(availability)
      .values({
        churchId,
        volunteerId: input.volunteerId,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        isAllDay: input.isAllDay,
        reason: input.reason ?? null,
        repeatRule: input.repeatRule ?? null,
      })
      .returning();
    if (!row) throw new Error('Availability insert failed');
    return mapAvailability(row);
  }

  async update(
    churchId: ChurchId,
    id: AvailabilityId,
    input: UpdateAvailabilityInput,
    tx?: TransactionContext,
  ): Promise<void> {
    const update: Partial<typeof availability.$inferInsert> = {};
    if (input.type != null) update.type = input.type;
    if (input.startTime != null) update.startTime = input.startTime;
    if (input.endTime != null) update.endTime = input.endTime;
    if (input.isAllDay != null) update.isAllDay = input.isAllDay;
    if (input.reason !== undefined) update.reason = input.reason ?? null;
    if (input.repeatRule !== undefined)
      update.repeatRule = input.repeatRule ?? null;
    await getClient(this.db, tx)
      .update(availability)
      .set(update)
      .where(
        and(
          eq(availability.id, id),
          withChurchIsolation(availability, churchId),
        ),
      );
  }

  async delete(
    churchId: ChurchId,
    id: AvailabilityId,
    tx?: TransactionContext,
  ): Promise<void> {
    await getClient(this.db, tx)
      .delete(availability)
      .where(
        and(
          eq(availability.id, id),
          withChurchIsolation(availability, churchId),
        ),
      );
  }
}

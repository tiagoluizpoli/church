// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import { NotFoundError } from '@church/core';
import {
  Availability,
  type AvailabilityId,
} from '../../../src/domain/entities/availability';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import type { VolunteerId } from '../../../src/domain/entities/volunteer';
import type {
  AvailabilityRepository,
  CreateAvailabilityInput,
  UpdateAvailabilityInput,
} from '../../../src/domain/repositories/availability.repository';
import { runAvailabilityRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/availability.contract-spec';

class MockAvailabilityRepository implements AvailabilityRepository {
  private availabilities = new Map<string, Availability>();
  private idCounter = 1;

  constructor() {
    const av1 = new Availability(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        volunteerId: '44444444-4444-4444-4444-444444444441' as VolunteerId,
        type: 'unavailable',
        startTime: new Date('2024-06-01T10:00:00Z'),
        endTime: new Date('2024-06-01T12:00:00Z'),
        isAllDay: false,
      },
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as AvailabilityId,
    );
    this.availabilities.set(av1.id, av1);
  }

  async getById(churchId: ChurchId, id: AvailabilityId): Promise<Availability> {
    const availability = this.availabilities.get(id);
    if (!availability || availability.churchId !== churchId) {
      throw new NotFoundError('Availability entry not found');
    }

    return availability;
  }

  async listByVolunteerInRange(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    startTime: Date,
    endTime: Date,
  ): Promise<Availability[]> {
    return Array.from(this.availabilities.values()).filter(
      (av) =>
        av.churchId === churchId &&
        av.volunteerId === volunteerId &&
        av.startTime >= startTime &&
        av.endTime <= endTime,
    );
  }

  async listByVolunteerForEvent(
    churchId: ChurchId,
    volunteerId: VolunteerId,
    eventId: EventId,
  ): Promise<Availability[]> {
    return Array.from(this.availabilities.values()).filter(
      (availability) =>
        availability.churchId === churchId &&
        availability.volunteerId === volunteerId &&
        availability.eventId === eventId,
    );
  }

  async create(
    churchId: ChurchId,
    input: CreateAvailabilityInput,
  ): Promise<Availability> {
    const id = `availability-gen-${this.idCounter++}` as AvailabilityId;
    const av = new Availability(
      {
        churchId,
        volunteerId: input.volunteerId,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        isAllDay: input.isAllDay,
        reason: input.reason,
        repeatRule: input.repeatRule,
      },
      id,
    );
    this.availabilities.set(av.id, av);
    return av;
  }

  async update(
    churchId: ChurchId,
    id: AvailabilityId,
    input: UpdateAvailabilityInput,
  ): Promise<void> {
    const av = this.availabilities.get(id);
    if (!av || av.churchId !== churchId) {
      throw new NotFoundError('Availability entry not found');
    }

    const props = (av as any)._props;
    if (input.type !== undefined) props.type = input.type;
    if (input.startTime !== undefined) props.startTime = input.startTime;
    if (input.endTime !== undefined) props.endTime = input.endTime;
    if (input.isAllDay !== undefined) props.isAllDay = input.isAllDay;
    if (input.reason !== undefined) props.reason = input.reason;
    if (input.repeatRule !== undefined) props.repeatRule = input.repeatRule;
    (av as any)._updatedAt = new Date();
  }

  async delete(churchId: ChurchId, id: AvailabilityId): Promise<void> {
    const av = this.availabilities.get(id);
    if (av && av.churchId === churchId) {
      this.availabilities.delete(id);
    }
  }

  async listByVolunteers(
    churchId: ChurchId,
    volunteerIds: VolunteerId[],
  ): Promise<Availability[]> {
    return Array.from(this.availabilities.values()).filter(
      (av) => av.churchId === churchId && volunteerIds.includes(av.volunteerId),
    );
  }
}

runAvailabilityRepositoryContractTests(
  async () => new MockAvailabilityRepository(),
  async () => {},
);

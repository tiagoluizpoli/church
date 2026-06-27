import { NotFoundError } from '@church/core';
import type { ChurchId } from '../../../src/domain/entities/church';
import {
  Event,
  type EventId,
  type EventStatus,
  type EventWithSlots,
} from '../../../src/domain/entities/event';
import type { MinistryId } from '../../../src/domain/entities/ministry';
import type { RoleId } from '../../../src/domain/entities/role';
import {
  SlotRequirement,
  type SlotRequirementId,
} from '../../../src/domain/entities/slot-requirement';
import {
  TimeSlot,
  type TimeSlotId,
} from '../../../src/domain/entities/time-slot';
import { runEventRepositoryContractTests } from '../../../src/domain/repositories/contract-tests/event.contract-spec';
import type {
  CreateEventInput,
  EventRepository,
  UpdateEventInput,
  UpdateEventStatusInput,
} from '../../../src/domain/repositories/event.repository';

class MockEventRepository implements EventRepository {
  private events = new Map<string, Event>();
  private slots = new Map<string, TimeSlot[]>();
  private idCounter = 1;

  constructor() {
    const e1 = new Event(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
        title: 'Youth Gathering',
        startDate: new Date('2024-06-05T10:00:00Z'),
        endDate: new Date('2024-06-05T12:00:00Z'),
        status: 'draft',
      },
      '66666666-6666-6666-6666-666666666661' as EventId,
    );
    const e2 = new Event(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        ministryId: '33333333-3333-3333-3333-333333333331' as MinistryId,
        title: 'Sunday Service',
        startDate: new Date('2024-06-04T10:00:00Z'),
        endDate: new Date('2024-06-04T12:00:00Z'),
        status: 'published',
      },
      '66666666-6666-6666-6666-666666666662' as EventId,
    );

    this.events.set(e1.id, e1);
    this.events.set(e2.id, e2);

    const req = new SlotRequirement(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        slotId: '77777777-7777-7777-7777-777777777771' as TimeSlotId,
        roleId: '55555555-5555-5555-5555-555555555551' as RoleId,
        requiredCount: 1,
      },
      '88888888-8888-8888-8888-888888888881' as SlotRequirementId,
    );

    const slot = new TimeSlot(
      {
        churchId: '11111111-1111-1111-1111-111111111111' as ChurchId,
        eventId: e1.id,
        startTime: e1.startDate,
        endTime: e1.endDate,
        status: 'active',
        requirements: [req],
      },
      '77777777-7777-7777-7777-777777777771' as TimeSlotId,
    );

    this.slots.set(e1.id, [slot]);
  }

  async getById(churchId: ChurchId, id: EventId): Promise<Event> {
    const e = this.events.get(id);
    if (!e || e.churchId !== churchId) {
      throw new NotFoundError('Event not found');
    }
    return e;
  }

  async getWithSlots(churchId: ChurchId, id: EventId): Promise<EventWithSlots> {
    const event = await this.getById(churchId, id);
    const slots = this.slots.get(id) ?? [];
    return { event, slots };
  }

  async listByMinistry(
    churchId: ChurchId,
    ministryId: MinistryId,
    status?: EventStatus,
  ): Promise<Event[]> {
    let list = Array.from(this.events.values()).filter(
      (e) => e.churchId === churchId && e.ministryId === ministryId,
    );
    if (status) {
      list = list.filter((e) => e.status === status);
    }
    return list.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  async create(churchId: ChurchId, input: CreateEventInput): Promise<Event> {
    const id = `event-gen-${this.idCounter++}` as EventId;
    const e = new Event(
      {
        churchId,
        ministryId: input.ministryId,
        title: input.title,
        description: input.description,
        location: input.location,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status ?? 'draft',
      },
      id,
    );
    this.events.set(e.id, e);
    return e;
  }

  async updateStatus(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventStatusInput,
  ): Promise<void> {
    const e = await this.getById(churchId, id);
    if (input.status === 'published') {
      e.publish();
    } else if (input.status === 'cancelled') {
      e.cancel();
    } else if (input.status === 'past') {
      e.markAsPast();
    }
    this.events.set(e.id, e);
  }

  async update(
    churchId: ChurchId,
    id: EventId,
    input: UpdateEventInput,
  ): Promise<Event> {
    const e = await this.getById(churchId, id);
    const updated = new Event(
      {
        churchId: e.churchId,
        ministryId: e.ministryId,
        title: input.title ?? e.title,
        description: e.description,
        location: e.location,
        startDate: input.startDate ?? e.startDate,
        endDate: input.endDate ?? e.endDate,
        status: e.status,
        eventType: e.eventType,
      },
      e.id,
    );
    this.events.set(updated.id, updated);
    return updated;
  }
}

runEventRepositoryContractTests(
  async () => new MockEventRepository(),
  async () => {},
);

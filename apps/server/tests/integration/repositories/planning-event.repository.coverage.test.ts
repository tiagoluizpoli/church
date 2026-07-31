import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  EventId,
  EventTemplateId,
  PlanningCycleId,
} from '../../../src/domain/branded-ids';
import { DrizzlePlanningEventRepository } from '../../../src/infrastructure/repositories/drizzle-planning-event.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3Template,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('DrizzlePlanningEventRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('createEvent persists optional sourceTemplateId/description/location when provided', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(seed.churchAId);
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const { template } = await createSchedulingPhase3Template({
      churchId: seed.churchAId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [],
    });
    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });

    const created = await repo.createEvent({
      churchId,
      planningCycleId: PlanningCycleId.from(cycle.id),
      sourceTemplateId: EventTemplateId.from(template.id),
      title: 'Prayer Night',
      description: 'A night of prayer',
      location: 'Main hall',
      startDate: new Date('2026-08-05T22:00:00.000Z'),
      endDate: new Date('2026-08-06T00:00:00.000Z'),
      status: 'draft',
      eventType: 'day_based',
    });

    expect(created.sourceTemplateId).toBe(template.id);
    expect(created.description).toBe('A night of prayer');
    expect(created.location).toBe('Main hall');
  });

  it('updateEvent applies every optional field when provided and leaves the rest when omitted', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(seed.churchAId);
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });

    const created = await repo.createEvent({
      churchId,
      planningCycleId: PlanningCycleId.from(cycle.id),
      title: 'Original title',
      startDate: new Date('2026-08-05T22:00:00.000Z'),
      endDate: new Date('2026-08-06T00:00:00.000Z'),
      status: 'draft',
      eventType: 'day_based',
    });

    // Partial update: only title, everything else omitted (exercises the
    // "undefined" side of the description/location/startDate/endDate/status
    // ternaries).
    const titleOnly = await repo.updateEvent({
      churchId,
      eventId: created.id,
      title: 'New title',
    });
    expect(titleOnly.title).toBe('New title');

    // Full update: every optional field provided (exercises the "provided"
    // side of each ternary).
    const fullyUpdated = await repo.updateEvent({
      churchId,
      eventId: created.id,
      description: 'New description',
      location: 'New location',
      startDate: new Date('2026-08-06T22:00:00.000Z'),
      endDate: new Date('2026-08-07T00:00:00.000Z'),
      status: 'scheduled',
    });

    expect(fullyUpdated.description).toBe('New description');
    expect(fullyUpdated.location).toBe('New location');
    expect(fullyUpdated.status).toBe('scheduled');
  });

  it('updateEvent throws NotFoundError when the event does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });

    await expect(
      repo.updateEvent({
        churchId: ChurchId.from(seed.churchAId),
        eventId: EventId.from('99999999-9999-4999-8999-999999999999'),
        title: 'Nope',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getEvent throws NotFoundError for an invalid uuid and for a missing event', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getEvent({ churchId, eventId: EventId.from('not-a-uuid') }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getEvent({
        churchId,
        eventId: EventId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('createTimeSlot defaults a missing label to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(seed.churchAId);
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });

    const createdEvent = await repo.createEvent({
      churchId,
      planningCycleId: PlanningCycleId.from(cycle.id),
      title: 'Prayer Night',
      startDate: new Date('2026-08-05T22:00:00.000Z'),
      endDate: new Date('2026-08-06T00:00:00.000Z'),
      status: 'draft',
      eventType: 'day_based',
    });

    const slotId = await repo.createTimeSlot({
      churchId,
      eventId: createdEvent.id,
      startTime: new Date('2026-08-05T22:00:00.000Z'),
      endTime: new Date('2026-08-05T23:00:00.000Z'),
    });

    expect(slotId).toBeDefined();
  });

  it('seedParticipations is a no-op when the church has no ministries', async () => {
    await seedSchedulingPhase3Base();
    const emptyChurch = await (await import('@church/db')).createChurch({
      db: schedulingTestDb,
      name: 'Ministry-less Church',
      slug: 'ministry-less-church',
      timezone: 'UTC',
    });

    const repo = new DrizzlePlanningEventRepository({ db: schedulingTestDb });

    await expect(
      repo.seedParticipations({
        churchId: ChurchId.from(emptyChurch.id),
        eventId: EventId.from('99999999-9999-4999-8999-999999999999'),
      }),
    ).resolves.toBeUndefined();
  });
});

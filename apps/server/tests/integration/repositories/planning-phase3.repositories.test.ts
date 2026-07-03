import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, PlanningCycleId } from '../../../src/domain/branded-ids';
import { DrizzleEventTemplateRepository } from '../../../src/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzlePlanningCycleRepository } from '../../../src/infrastructure/repositories/drizzle-planning-cycle.repository';
import { DrizzlePlanningEventRepository } from '../../../src/infrastructure/repositories/drizzle-planning-event.repository';
import {
  createSchedulingPhase3Cycle,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

describe('Phase 3 planning repositories', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('round-trips planning cycles and filters them by church and state', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repository = new DrizzlePlanningCycleRepository(schedulingTestDb);

    const created = await repository.create({
      churchId: ChurchId.from(seed.churchAId),
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    await repository.create({
      churchId: ChurchId.from(seed.churchBId),
      name: 'Other Church',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
      state: 'locked',
    });

    await repository.updateState({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: created.id,
      state: 'locked',
    });

    const found = await repository.getById({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: created.id,
    });
    const listed = await repository.list({
      churchId: ChurchId.from(seed.churchAId),
      state: 'locked',
    });

    expect(found.name).toBe('August 2026');
    expect(found.state).toBe('locked');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.churchId).toBe(seed.churchAId);
  });

  it('detects overlapping planning cycles per church only', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repository = new DrizzlePlanningCycleRepository(schedulingTestDb);

    await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });

    const overlaps = await repository.findOverlapping({
      churchId: ChurchId.from(seed.churchAId),
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: new Date('2026-09-15T00:00:00.000Z'),
    });
    const otherChurchOverlaps = await repository.findOverlapping({
      churchId: ChurchId.from(seed.churchBId),
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(overlaps).toHaveLength(1);
    expect(otherChurchOverlaps).toHaveLength(0);
  });

  it('round-trips templates with ordered blocks and deletes them cleanly', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repository = new DrizzleEventTemplateRepository(schedulingTestDb);

    const created = await repository.create({
      churchId: ChurchId.from(seed.churchAId),
      name: 'Sunday Service',
      weekday: 0,
      blocks: [
        {
          label: 'Message',
          startTime: '10:00:00',
          endTime: '11:00:00',
          order: 2,
        },
        {
          label: 'Welcome',
          startTime: '09:00:00',
          endTime: '09:30:00',
          order: 1,
        },
      ],
    });

    const updated = await repository.update({
      churchId: ChurchId.from(seed.churchAId),
      templateId: created.id,
      name: 'Sunday Gathering',
      weekday: 0,
      blocks: [
        {
          label: 'Welcome',
          startTime: '09:00:00',
          endTime: '09:30:00',
          order: 0,
        },
      ],
    });
    const listed = await repository.list({
      churchId: ChurchId.from(seed.churchAId),
    });

    expect(created.blocks.map((block) => block.order)).toEqual([1, 2]);
    expect(updated.name).toBe('Sunday Gathering');
    expect(updated.blocks).toHaveLength(1);
    expect(listed).toHaveLength(1);

    await repository.delete({
      churchId: ChurchId.from(seed.churchAId),
      templateId: created.id,
    });

    expect(
      await repository.list({
        churchId: ChurchId.from(seed.churchAId),
      }),
    ).toHaveLength(0);
  });

  it('creates events, seeds participations, maps nullable fields to undefined, and returns slots by cycle', async () => {
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: 'August 2026',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const repository = new DrizzlePlanningEventRepository(schedulingTestDb);

    const createdEvent = await repository.createEvent({
      churchId: ChurchId.from(seed.churchAId),
      planningCycleId: PlanningCycleId.from(cycle.id),
      title: 'Prayer Night',
      startDate: new Date('2026-08-05T22:00:00.000Z'),
      endDate: new Date('2026-08-06T00:00:00.000Z'),
      status: 'draft',
      eventType: 'day_based',
    });

    await repository.seedParticipations({
      churchId: ChurchId.from(seed.churchAId),
      eventId: createdEvent.id,
    });

    await repository.createTimeSlot({
      churchId: ChurchId.from(seed.churchAId),
      eventId: createdEvent.id,
      startTime: new Date('2026-08-05T22:00:00.000Z'),
      endTime: new Date('2026-08-05T23:00:00.000Z'),
      label: 'Opening',
    });

    const events = await repository.listCycleEvents({
      churchId: ChurchId.from(seed.churchAId),
      cycleId: PlanningCycleId.from(cycle.id),
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.event.sourceTemplateId).toBeUndefined();
    expect(events[0]?.slots[0]?.sourceTemplateBlockId).toBeUndefined();
    expect(events[0]?.slots[0]?.label).toBe('Opening');
  });
});

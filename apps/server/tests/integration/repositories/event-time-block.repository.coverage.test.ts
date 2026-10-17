import { NotFoundError } from '@church/core';
import { shift as shiftTable } from '@church/db';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  EventId,
  EventTimeBlockId,
  RoleId,
} from '@/domain/branded-ids';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { buildRole } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildEvent,
  buildShift,
} from '@/seeds/builders/scheduling';
import { seedRequirement } from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

async function seedEventGraph(churchId: string, ministryId: string) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
  });
  return createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Sunday Service',
    start: new Date('2026-08-02T09:00:00.000Z'),
    end: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });
}

describe('DrizzleEventTimeBlockRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    await expect(
      repo.getById(
        ChurchId.from(seed.churchAId),
        EventTimeBlockId.from('not-a-uuid'),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('create() attaches shifts for every existing participation on the event', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const eventId = EventId.from(graph.event.id);

    const created = await repo.create(churchId, {
      eventId,
      startTime: new Date('2026-08-02T11:00:00.000Z'),
      endTime: new Date('2026-08-02T12:00:00.000Z'),
      label: 'Extra event time block',
    });

    expect(created.label).toBe('Extra event time block');
    const shifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.eventTimeBlockId, created.id));
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.participationId).toBe(graph.participation.id);
  });

  it('update() applies only provided fields and throws NotFoundError when missing', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const updated = await repo.update(
      churchId,
      EventTimeBlockId.from(graph.eventTimeBlock.id),
      {
        label: 'Renamed event time block',
      },
    );
    expect(updated.label).toBe('Renamed event time block');
    expect(updated.startTime).toEqual(
      fromDate({ date: graph.eventTimeBlock.startTime }),
    );

    await expect(
      repo.update(
        churchId,
        EventTimeBlockId.from('99999999-9999-4999-8999-999999999999'),
        { label: 'nope' },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('deleteById removes the event time block', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await repo.deleteById(
      churchId,
      EventTimeBlockId.from(graph.eventTimeBlock.id),
    );
    await expect(
      repo.getById(churchId, EventTimeBlockId.from(graph.eventTimeBlock.id)),
    ).rejects.toThrow(NotFoundError);
  });

  it('create() defaults an omitted label to null and skips shift creation when the event has no participations', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(seed.churchAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });

    // Create a bare event with no participation via a fresh graph helper that
    // skips participation creation: reuse seedEventGraph's cycle + a raw event.
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const bareEvent = await buildEvent({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      cycleId: cycle.id,
      title: 'No participations yet',
      start: fromDate({ date: new Date('2026-08-03T09:00:00.000Z') }),
      end: fromDate({ date: new Date('2026-08-03T11:00:00.000Z') }),
      status: 'draft',
    });

    const created = await repo.create(churchId, {
      eventId: EventId.from(bareEvent.id),
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
    });
    expect(created.label).toBeUndefined();
    const shiftsForBareEvent = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.eventTimeBlockId, created.id));
    expect(shiftsForBareEvent).toHaveLength(0);
  });

  it('update() applies startTime and endTime when label is omitted', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const newStart = new Date('2026-08-02T10:00:00.000Z');
    const newEnd = new Date('2026-08-02T10:30:00.000Z');
    const updated = await repo.update(
      churchId,
      EventTimeBlockId.from(graph.eventTimeBlock.id),
      {
        startTime: newStart,
        endTime: newEnd,
      },
    );

    expect(updated.startTime).toEqual(fromDate({ date: newStart }));
    expect(updated.endTime).toEqual(fromDate({ date: newEnd }));
    expect(updated.label).toBe(graph.eventTimeBlock.label ?? undefined);
  });

  it('countActiveAssignments counts only pending/confirmed assignments for the role on the event time block', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleEventTimeBlockRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const eventTimeBlockId = EventTimeBlockId.from(graph.eventTimeBlock.id);

    const shiftRow = await buildShift({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    });

    const roleRow = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Greeter',
    });
    const roleId = RoleId.from(roleRow.id);

    expect(
      await repo.countActiveAssignments(churchId, eventTimeBlockId, roleId),
    ).toBe(0);

    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shiftRow.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });
    await buildAssignment({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shiftRow.id,
      shiftRequirementId: requirement.id,
      volunteerId: seed.adminVolunteerId,
      roleId: roleRow.id,
      status: 'confirmed',
    });

    expect(
      await repo.countActiveAssignments(churchId, eventTimeBlockId, roleId),
    ).toBe(1);
  });
});

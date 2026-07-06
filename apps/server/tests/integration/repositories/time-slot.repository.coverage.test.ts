import { NotFoundError } from '@church/core';
import { assignment, role, shift as shiftTable } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  EventId,
  RoleId,
  TimeSlotId,
} from '../../../src/domain/branded-ids';
import { DrizzleTimeSlotRepository } from '../../../src/infrastructure/repositories/drizzle-time-slot.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

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
    startDate: new Date('2026-08-02T09:00:00.000Z'),
    endDate: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });
}

describe('DrizzleTimeSlotRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getById throws NotFoundError for an invalid uuid', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    await expect(
      repo.getById(
        ChurchId.from(seed.churchAId),
        TimeSlotId.from('not-a-uuid'),
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('create() attaches shifts for every existing participation on the event', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);
    const eventId = EventId.from(graph.event.id);

    const created = await repo.create(churchId, {
      eventId,
      startTime: new Date('2026-08-02T11:00:00.000Z'),
      endTime: new Date('2026-08-02T12:00:00.000Z'),
      label: 'Extra slot',
    });

    expect(created.label).toBe('Extra slot');
    const shifts = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.timeSlotId, created.id));
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.participationId).toBe(graph.participation.id);
  });

  it('update() applies only provided fields and throws NotFoundError when missing', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const updated = await repo.update(
      churchId,
      TimeSlotId.from(graph.slot.id),
      {
        label: 'Renamed slot',
      },
    );
    expect(updated.label).toBe('Renamed slot');
    expect(updated.startTime).toEqual(graph.slot.startTime);

    await expect(
      repo.update(
        churchId,
        TimeSlotId.from('99999999-9999-4999-8999-999999999999'),
        { label: 'nope' },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it('deleteById removes the slot', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    await repo.deleteById(churchId, TimeSlotId.from(graph.slot.id));
    await expect(
      repo.getById(churchId, TimeSlotId.from(graph.slot.id)),
    ).rejects.toThrow(NotFoundError);
  });

  it('upsertRequirement inserts then updates the required count for the same role', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);
    const slotId = TimeSlotId.from(graph.slot.id);

    await schedulingTestDb.insert(shiftTable).values({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
    });

    const [roleRow] = await schedulingTestDb
      .insert(role)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Usher',
      })
      .returning();
    if (!roleRow) throw new Error('role seed failed');
    const roleId = RoleId.from(roleRow.id);

    const inserted = await repo.upsertRequirement(churchId, slotId, {
      roleId,
      requiredCount: 2,
    });
    expect(inserted.requiredCount).toBe(2);

    const updated = await repo.upsertRequirement(churchId, slotId, {
      roleId,
      requiredCount: 4,
    });
    expect(updated.id).toBe(inserted.id);
    expect(updated.requiredCount).toBe(4);
  });

  it('upsertRequirement throws NotFoundError when the slot has no shift', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const [roleRow] = await schedulingTestDb
      .insert(role)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Usher',
      })
      .returning();
    if (!roleRow) throw new Error('role seed failed');

    // slot exists but no shift was ever created for it in this test
    await expect(
      repo.upsertRequirement(churchId, TimeSlotId.from(graph.slot.id), {
        roleId: RoleId.from(roleRow.id),
        requiredCount: 1,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('bulkCreate throws NotFoundError when the event has no participation, and defaults an omitted label to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.bulkCreate(churchId, {
        eventId: EventId.from('99999999-9999-4999-8999-999999999999'),
        slots: [
          {
            startTime: new Date('2026-08-02T12:00:00.000Z'),
            endTime: new Date('2026-08-02T13:00:00.000Z'),
          },
        ],
      }),
    ).rejects.toThrow(NotFoundError);

    const eventId = EventId.from(graph.event.id);
    const [created] = await repo.bulkCreate(churchId, {
      eventId,
      slots: [
        {
          startTime: new Date('2026-08-02T12:00:00.000Z'),
          endTime: new Date('2026-08-02T13:00:00.000Z'),
        },
      ],
    });

    expect(created?.label).toBeUndefined();
    expect(created?.requirements).toEqual([]);
  });

  it('create() defaults an omitted label to null and skips shift creation when the event has no participations', async () => {
    const seed = await seedSchedulingPhase3Base();
    const churchId = ChurchId.from(seed.churchAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);

    // Create a bare event with no participation via a fresh graph helper that
    // skips participation creation: reuse seedEventGraph's cycle + a raw event.
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const [bareEvent] = await schedulingTestDb
      .insert((await import('@church/db')).event)
      .values({
        churchId: seed.churchAId,
        planningCycleId: cycle.id,
        title: 'No participations yet',
        startDate: new Date('2026-08-03T09:00:00.000Z'),
        endDate: new Date('2026-08-03T11:00:00.000Z'),
        status: 'draft',
      })
      .returning();
    if (!bareEvent) throw new Error('event seed failed');

    const created = await repo.create(churchId, {
      eventId: EventId.from(bareEvent.id),
      startTime: new Date('2026-08-03T09:00:00.000Z'),
      endTime: new Date('2026-08-03T10:00:00.000Z'),
    });
    expect(created.label).toBeUndefined();
    const shiftsForBareEvent = await schedulingTestDb
      .select()
      .from(shiftTable)
      .where(eq(shiftTable.timeSlotId, created.id));
    expect(shiftsForBareEvent).toHaveLength(0);
  });

  it('update() applies startTime and endTime when label is omitted', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const newStart = new Date('2026-08-02T10:00:00.000Z');
    const newEnd = new Date('2026-08-02T10:30:00.000Z');
    const updated = await repo.update(
      churchId,
      TimeSlotId.from(graph.slot.id),
      {
        startTime: newStart,
        endTime: newEnd,
      },
    );

    expect(updated.startTime).toEqual(newStart);
    expect(updated.endTime).toEqual(newEnd);
    expect(updated.label).toBe(graph.slot.label ?? undefined);
  });

  it('countActiveAssignments counts only pending/confirmed assignments for the role on the slot', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleTimeSlotRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);
    const slotId = TimeSlotId.from(graph.slot.id);

    const [shiftRow] = await schedulingTestDb
      .insert(shiftTable)
      .values({
        churchId: seed.churchAId,
        participationId: graph.participation.id,
        timeSlotId: graph.slot.id,
        startTime: graph.slot.startTime,
        endTime: graph.slot.endTime,
      })
      .returning();
    if (!shiftRow) throw new Error('shift seed failed');

    const [roleRow] = await schedulingTestDb
      .insert(role)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryAId,
        name: 'Greeter',
      })
      .returning();
    if (!roleRow) throw new Error('role seed failed');
    const roleId = RoleId.from(roleRow.id);

    expect(await repo.countActiveAssignments(churchId, slotId, roleId)).toBe(0);

    await schedulingTestDb.insert(assignment).values([
      {
        churchId: seed.churchAId,
        participationId: graph.participation.id,
        shiftId: shiftRow.id,
        volunteerId: seed.adminVolunteerId,
        roleId: roleRow.id,
        status: 'confirmed',
      },
    ]);

    expect(await repo.countActiveAssignments(churchId, slotId, roleId)).toBe(1);
  });
});

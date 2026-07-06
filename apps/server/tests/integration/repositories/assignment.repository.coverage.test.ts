import { role, shift as shiftTable } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  EventId,
  RoleId,
  ShiftId,
  TimeSlotId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { DrizzleAssignmentRepository } from '../../../src/infrastructure/repositories/drizzle-assignment.repository';
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

describe('DrizzleAssignmentRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('create() throws when neither shiftId nor slotId is provided', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
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

    await expect(
      repo.create(churchId, {
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        roleId: RoleId.from(roleRow.id),
      }),
    ).rejects.toThrow('Assignment creation requires either shiftId or slotId');
  });

  it('create() throws NotFoundError when the slotId has no shift, and resolves via a real shiftId', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
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
    const roleId = RoleId.from(roleRow.id);

    // No shift exists for this slot yet.
    await expect(
      repo.create(churchId, {
        slotId: TimeSlotId.from(graph.slot.id),
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        roleId,
      }),
    ).rejects.toThrow('Shift not found for slot');

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

    const createdViaShiftId = await repo.create(churchId, {
      shiftId: ShiftId.from(shiftRow.id),
      volunteerId: VolunteerId.from(seed.adminVolunteerId),
      roleId,
    });
    expect(createdViaShiftId.shiftId).toBe(shiftRow.id);
    expect(createdViaShiftId.participationId).toBe(graph.participation.id);
  });

  it('findBySlotAndVolunteer returns null when there is no match', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    const found = await repo.findBySlotAndVolunteer(
      churchId,
      TimeSlotId.from(graph.slot.id),
      VolunteerId.from(seed.adminVolunteerId),
    );
    expect(found).toBeNull();
  });

  it('listByVolunteers returns [] for an empty id list without querying', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
    const result = await repo.listByVolunteers(
      ChurchId.from(seed.churchAId),
      [],
    );
    expect(result).toEqual([]);
  });

  it('updateStatus defaults a missing reason to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
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

    const created = await repo.create(churchId, {
      shiftId: ShiftId.from(shiftRow.id),
      volunteerId: VolunteerId.from(seed.adminVolunteerId),
      roleId: RoleId.from(roleRow.id),
    });

    await repo.updateStatus(churchId, created.id, { status: 'confirmed' });
    const updated = await repo.getById(churchId, created.id);
    expect(updated.status).toBe('confirmed');
    expect(updated.reason).toBeUndefined();
  });

  it('deleteByEvent is a no-op when the event has no assignments', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository(schedulingTestDb);
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.deleteByEvent(churchId, EventId.from(graph.event.id)),
    ).resolves.toBeUndefined();
  });
});

import { shiftRequirement } from '@church/db';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChurchId,
  EventId,
  EventTimeBlockId,
  ShiftId,
  ShiftRequirementId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { buildRole } from '@/seeds/builders/ministry';
import { buildShift } from '@/seeds/builders/scheduling';
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

describe('DrizzleAssignmentRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('create() throws when neither shiftId nor eventTimeBlockId is provided', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    await expect(
      repo.create({
        churchId: churchId,
        input: {
          volunteerId: VolunteerId.from(seed.adminVolunteerId),
          shiftRequirementId: ShiftRequirementId.from({
            raw: '88888888-8888-8888-8888-888888888888',
          }),
        },
      }),
    ).rejects.toThrow(
      'Assignment creation requires either shiftId or eventTimeBlockId',
    );
  });

  it('create() throws NotFoundError when the eventTimeBlockId has no shift, and resolves via a real shiftId', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const roleRow = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });

    // No shift exists for this event time block yet.
    await expect(
      repo.create({
        churchId: churchId,
        input: {
          eventTimeBlockId: EventTimeBlockId.from(graph.eventTimeBlock.id),
          volunteerId: VolunteerId.from(seed.adminVolunteerId),
          shiftRequirementId: ShiftRequirementId.from({
            raw: '88888888-8888-8888-8888-888888888888',
          }),
        },
      }),
    ).rejects.toThrow('Shift requirement not found');

    const shiftRow = await buildShift({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    });

    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shiftRow.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });
    const createdViaShiftId = await repo.create({
      churchId: churchId,
      input: {
        shiftId: ShiftId.from(shiftRow.id),
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        shiftRequirementId: ShiftRequirementId.from({ raw: requirement.id }),
      },
    });
    expect(createdViaShiftId.shiftId).toBe(shiftRow.id);
    expect(createdViaShiftId.participationId).toBe(graph.participation.id);
    const retrieved = await repo.getById({
      churchId,
      assignmentId: createdViaShiftId.id,
    });
    expect(retrieved.shiftRequirementId).toBe(requirement.id);
    expect(retrieved.roleId).toBe(roleRow.id);
    await schedulingTestDb
      .delete(shiftRequirement)
      .where(eq(shiftRequirement.id, requirement.id));
    await expect(
      repo.getById({ churchId, assignmentId: createdViaShiftId.id }),
    ).rejects.toThrow('Assignment not found');
  });

  it('binds the explicit requirement when two Shifts share one event time block', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const role = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });
    const shiftInput = {
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    };
    await buildShift(shiftInput);
    const targetShift = await buildShift(shiftInput);
    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: targetShift.id,
      roleId: role.id,
      peopleNeeded: 1,
    });
    const created = await repo.create({
      churchId: ChurchId.from(seed.churchAId),
      input: {
        eventTimeBlockId: EventTimeBlockId.from(graph.eventTimeBlock.id),
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        shiftRequirementId: ShiftRequirementId.from({ raw: requirement.id }),
      },
    });
    expect(created.shiftId).toBe(targetShift.id);
    expect(created.participationId).toBe(graph.participation.id);
    expect(created.roleId).toBe(role.id);
    expect(created.shiftRequirementId).toBe(requirement.id);
  });

  it('findByEventTimeBlockAndVolunteer returns null when there is no match', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const found = await repo.findByEventTimeBlockAndVolunteer({
      churchId,
      eventTimeBlockId: EventTimeBlockId.from(graph.eventTimeBlock.id),
      volunteerId: VolunteerId.from(seed.adminVolunteerId),
    });
    expect(found).toBeNull();
  });

  it('listByVolunteers returns [] for an empty id list without querying', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const result = await repo.listByVolunteers({
      churchId: ChurchId.from(seed.churchAId),
      volunteerIds: [],
    });
    expect(result).toEqual([]);
  });

  it('updateStatus defaults a missing reason to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const roleRow = await buildRole({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      name: 'Usher',
    });

    const shiftRow = await buildShift({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    });

    const requirement = await seedRequirement({
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      shiftId: shiftRow.id,
      roleId: roleRow.id,
      peopleNeeded: 1,
    });
    const created = await repo.create({
      churchId: churchId,
      input: {
        shiftId: ShiftId.from(shiftRow.id),
        volunteerId: VolunteerId.from(seed.adminVolunteerId),
        shiftRequirementId: ShiftRequirementId.from({ raw: requirement.id }),
      },
    });

    await repo.updateStatus({
      churchId,
      assignmentId: created.id,
      input: { status: 'confirmed' },
    });
    const updated = await repo.getById({ churchId, assignmentId: created.id });
    expect(updated.status).toBe('confirmed');
    expect(updated.reason).toBeUndefined();
  });

  it('deleteByEvent is a no-op when the event has no assignments', async () => {
    const seed = await seedSchedulingPhase3Base();
    const graph = await seedEventGraph(seed.churchAId, seed.ministryAId);
    const repo = new DrizzleAssignmentRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.deleteByEvent({ churchId, eventId: EventId.from(graph.event.id) }),
    ).resolves.toBeUndefined();
  });
});

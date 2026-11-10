import { swapRequest } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { AssignmentId, ChurchId, UserId } from '@/domain/branded-ids';
import { buildSector } from '@/seeds/builders/ministry';
import { buildAssignment } from '@/seeds/builders/scheduling';
import {
  createSchedulingManagers,
  seedRequirement,
  seedRole,
  seedShift,
  seedVolunteerMembership,
} from '@/tests/application/scheduling-schedule.helpers';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

async function seedOpenRequest() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'Future',
    startDate: new Date('2030-10-01T00:00:00Z'),
    endDate: new Date('2030-11-01T00:00:00Z'),
    state: 'sent',
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId: seed.ministryAId,
    title: 'Sunday',
    start: new Date('2030-10-13T13:00:00Z'),
    end: new Date('2030-10-13T15:00:00Z'),
    status: 'scheduled',
  });
  const role = await seedRole({
    churchId,
    ministryId: seed.ministryAId,
    name: 'Teacher',
  });
  const shift = await seedShift({
    churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    startTime: graph.eventTimeBlock.startTime,
    endTime: graph.eventTimeBlock.endTime,
    label: 'Morning',
  });
  const requirementInput = {
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    roleId: role.id,
    peopleNeeded: 1,
  };
  const from = await seedRequirement(requirementInput);
  const otherSector = await buildSector({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Outro',
  });
  const to = await seedRequirement({
    ...requirementInput,
    sectorId: otherSector.id,
  });
  const { volunteer } = await seedVolunteerMembership({
    churchId,
    ministryId: seed.ministryAId,
    name: 'Maria',
    email: 'maria-covered@test.com',
  });
  const mine = await buildAssignment({
    db,
    churchId,
    participationId: graph.participation.id,
    shiftId: shift.id,
    volunteerId: volunteer.id,
    roleId: role.id,
    shiftRequirementId: from.id,
    status: 'confirmed',
  });
  const [inserted] = await db
    .insert(swapRequest)
    .values({
      churchId,
      assignmentId: mine.id,
      status: 'open',
      raisedBy: volunteer.userId,
    })
    .returning();
  const request = inserted as NonNullable<typeof inserted>;
  return { seed, churchId, mine, to, request };
}

const rowFor = async (id: string) =>
  (await db.select().from(swapRequest).where(eq(swapRequest.id, id)))[0] ?? {
    closedAt: null,
  };

describe('closing an open swap request as covered', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('closes it, recording who and when, when the Assignment is moved', async () => {
    const { seed, churchId, mine, to, request } = await seedOpenRequest();
    await createSchedulingManagers().assignmentManager.moveParticipationAssignment(
      {
        churchId: ChurchId.from(churchId),
        assignmentId: AssignmentId.from(mine.id),
        shiftRequirementId: to.id,
        actorId: UserId.from(seed.adminUserId),
      } as never,
    );
    expect(await rowFor(request.id)).toMatchObject({
      status: 'covered',
      closedBy: seed.adminUserId,
    });
    expect((await rowFor(request.id)).closedAt).toBeInstanceOf(Date);
  });

  it('closes it, and keeps the row as history, when the Assignment is removed', async () => {
    const { seed, churchId, mine, request } = await seedOpenRequest();
    await createSchedulingManagers().assignmentManager.deleteAssignment({
      churchId: ChurchId.from(churchId),
      assignmentId: AssignmentId.from(mine.id),
      actorId: UserId.from(seed.adminUserId),
    });
    expect(await rowFor(request.id)).toMatchObject({
      status: 'covered',
      assignmentId: mine.id,
      closedBy: seed.adminUserId,
    });
  });
});

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignment,
  availability,
  availabilityCheck,
  churchAdmin,
  event,
  eventTemplate,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  participationSlotInclusion,
  planningCycle,
  role,
  shift,
  slotRequirement,
  timeBlock,
  timeSlot,
  user,
  volunteer,
  volunteerNotification,
} from '../../src/schema';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

interface SchedulingSeed {
  churchAId: string;
  churchBId: string;
  ministryId: string;
  roleId: string;
  userId: string;
  volunteerId: string;
  membershipId: string;
}

async function seedSchedulingBase(): Promise<SchedulingSeed> {
  const churchA = await createChurch({
    db: testDb,
    name: 'Church A',
    slug: 'church-a',
    timezone: 'America/Sao_Paulo',
  });
  const churchB = await createChurch({
    db: testDb,
    name: 'Church B',
    slug: 'church-b',
    timezone: 'UTC',
  });

  const userId = 'scheduling-admin-leader';
  await testDb.insert(user).values({
    id: userId,
    name: 'Admin Leader',
    email: 'admin-leader@test.com',
  });
  const [insertedMinistry] = await testDb
    .insert(ministry)
    .values({ churchId: churchA.id, name: 'Worship' })
    .returning();
  const [insertedVolunteer] = await testDb
    .insert(volunteer)
    .values({ churchId: churchA.id, userId })
    .returning();
  if (!insertedMinistry || !insertedVolunteer) {
    throw new Error('Ministry or volunteer seed failed');
  }

  const [insertedMembership] = await testDb
    .insert(ministryVolunteer)
    .values({
      churchId: churchA.id,
      ministryId: insertedMinistry.id,
      volunteerId: insertedVolunteer.id,
      systemRole: 'leader',
    })
    .returning();
  const [insertedRole] = await testDb
    .insert(role)
    .values({
      churchId: churchA.id,
      ministryId: insertedMinistry.id,
      name: 'Musician',
    })
    .returning();
  if (!insertedMembership || !insertedRole) {
    throw new Error('Membership or role seed failed');
  }

  await testDb.insert(churchAdmin).values({
    churchId: churchA.id,
    userId,
  });

  return {
    churchAId: churchA.id,
    churchBId: churchB.id,
    ministryId: insertedMinistry.id,
    roleId: insertedRole.id,
    userId,
    volunteerId: insertedVolunteer.id,
    membershipId: insertedMembership.id,
  };
}

interface PlanningSeed {
  cycleId: string;
  eventId: string;
  participationId: string;
  shiftId: string;
  slotId: string;
}

async function seedPlanningGraph(seed: SchedulingSeed): Promise<PlanningSeed> {
  const [cycle] = await testDb
    .insert(planningCycle)
    .values({
      churchId: seed.churchAId,
      name: 'August Plan',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
    })
    .returning();
  if (!cycle) throw new Error('Cycle seed failed');

  const [template] = await testDb
    .insert(eventTemplate)
    .values({ churchId: seed.churchAId, name: 'Sunday', weekday: 0 })
    .returning();
  if (!template) throw new Error('Template seed failed');
  const [block] = await testDb
    .insert(timeBlock)
    .values({
      churchId: seed.churchAId,
      templateId: template.id,
      label: 'Service',
      startTime: '09:00:00',
      endTime: '11:00:00',
      order: 0,
    })
    .returning();
  if (!block) throw new Error('Block seed failed');

  const [insertedEvent] = await testDb
    .insert(event)
    .values({
      churchId: seed.churchAId,
      planningCycleId: cycle.id,
      sourceTemplateId: template.id,
      title: 'Sunday Service',
      startDate: new Date('2026-08-09T12:00:00Z'),
      endDate: new Date('2026-08-09T14:00:00Z'),
    })
    .returning();
  if (!insertedEvent) throw new Error('Event seed failed');
  const [slot] = await testDb
    .insert(timeSlot)
    .values({
      churchId: seed.churchAId,
      eventId: insertedEvent.id,
      sourceTemplateBlockId: block.id,
      startTime: insertedEvent.startDate,
      endTime: insertedEvent.endDate,
    })
    .returning();
  const [participation] = await testDb
    .insert(ministryParticipation)
    .values({
      churchId: seed.churchAId,
      ministryId: seed.ministryId,
      eventId: insertedEvent.id,
    })
    .returning();
  if (!slot || !participation) throw new Error('Slot or participation failed');
  await testDb.insert(participationSlotInclusion).values({
    churchId: seed.churchAId,
    participationId: participation.id,
    timeSlotId: slot.id,
  });
  const [insertedShift] = await testDb
    .insert(shift)
    .values({
      churchId: seed.churchAId,
      participationId: participation.id,
      timeSlotId: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })
    .returning();
  if (!insertedShift) throw new Error('Shift seed failed');

  return {
    cycleId: cycle.id,
    eventId: insertedEvent.id,
    participationId: participation.id,
    shiftId: insertedShift.id,
    slotId: slot.id,
  };
}

describe('Scheduling reshape schema', () => {
  beforeEach(clearDatabase, 120_000);

  it('stores planning cycle boundaries as dates', async () => {
    const seed = await seedSchedulingBase();
    const [inserted] = await testDb
      .insert(planningCycle)
      .values({
        churchId: seed.churchAId,
        name: 'Date-only cycle',
        startDate: new Date('2026-08-01T15:30:00Z'),
        endDate: new Date('2026-09-01T15:30:00Z'),
      })
      .returning();
    if (!inserted) throw new Error('Cycle seed failed');

    const [cycle] = await testDb
      .select()
      .from(planningCycle)
      .where(eq(planningCycle.id, inserted.id));

    expect(cycle?.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(cycle?.endDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('prevents overlapping cycles per church but allows another church', async () => {
    const seed = await seedSchedulingBase();
    await testDb.insert(planningCycle).values({
      churchId: seed.churchAId,
      name: 'A',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
    });

    await expect(
      testDb.insert(planningCycle).values({
        churchId: seed.churchAId,
        name: 'Overlap',
        startDate: new Date('2026-08-15T00:00:00Z'),
        endDate: new Date('2026-09-15T00:00:00Z'),
      }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(planningCycle).values({
        churchId: seed.churchBId,
        name: 'Other church',
        startDate: new Date('2026-08-15T00:00:00Z'),
        endDate: new Date('2026-09-15T00:00:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('rejects shifts outside parent slot bounds', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);

    await expect(
      testDb.insert(shift).values({
        churchId: seed.churchAId,
        participationId: graph.participationId,
        timeSlotId: graph.slotId,
        startTime: new Date('2026-08-09T11:59:00Z'),
        endTime: new Date('2026-08-09T13:00:00Z'),
      }),
    ).rejects.toThrow();
  });

  it('re-keys requirements, assignments, and availability to shifts', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);
    const [check] = await testDb
      .insert(availabilityCheck)
      .values({
        churchId: seed.churchAId,
        planningCycleId: graph.cycleId,
        ministryVolunteerId: seed.membershipId,
      })
      .returning();
    if (!check) throw new Error('Availability check seed failed');

    await testDb.insert(slotRequirement).values({
      churchId: seed.churchAId,
      participationId: graph.participationId,
      shiftId: graph.shiftId,
      roleId: seed.roleId,
      requiredCount: 1,
    });
    await testDb.insert(assignment).values({
      churchId: seed.churchAId,
      participationId: graph.participationId,
      shiftId: graph.shiftId,
      volunteerId: seed.volunteerId,
      roleId: seed.roleId,
    });
    await testDb.insert(availability).values({
      churchId: seed.churchAId,
      availabilityCheckId: check.id,
      shiftId: graph.shiftId,
    });
    await testDb.insert(volunteerNotification).values({
      churchId: seed.churchAId,
      volunteerId: seed.volunteerId,
      planningCycleId: graph.cycleId,
      type: 'availability_reminder',
      title: 'Availability requested',
      body: 'Please respond',
      payload: {},
    });

    const marks = await testDb
      .select()
      .from(availability)
      .where(eq(availability.availabilityCheckId, check.id));
    expect(marks).toHaveLength(1);
  });

  it('cascades event deletion through participation scheduling data', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);

    await testDb.delete(event).where(eq(event.id, graph.eventId));

    const [slots, participations, shifts] = await Promise.all([
      testDb.select().from(timeSlot),
      testDb.select().from(ministryParticipation),
      testDb.select().from(shift),
    ]);
    expect(slots).toHaveLength(0);
    expect(participations).toHaveLength(0);
    expect(shifts).toHaveLength(0);
  });

  it('allows one user to hold ChurchAdmin and ministry leader roles', async () => {
    const seed = await seedSchedulingBase();

    const admins = await testDb
      .select()
      .from(churchAdmin)
      .where(eq(churchAdmin.userId, seed.userId));
    const memberships = await testDb
      .select()
      .from(ministryVolunteer)
      .where(eq(ministryVolunteer.volunteerId, seed.volunteerId));

    expect(admins).toHaveLength(1);
    expect(memberships[0]?.systemRole).toBe('leader');
  });
});

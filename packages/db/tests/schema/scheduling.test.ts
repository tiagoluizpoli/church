import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignment,
  availabilityCheck,
  cycle,
  event,
  eventTemplate,
  eventTimeBlock,
  member,
  ministry,
  ministryMembership,
  ministryParticipation,
  participationEventTimeBlockInclusion,
  role,
  sector,
  shift,
  shiftRequirement,
  templateTimeBlock,
  unavailableShift,
  user,
  volunteer,
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
    .insert(ministryMembership)
    .values({
      churchId: churchA.id,
      ministryId: insertedMinistry.id,
      volunteerId: insertedVolunteer.id,
      ministryAccessLevel: 'leader',
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

  // Church Membership at the `admin` Access Level — independent of the
  // Ministry Membership above, per CONTEXT.md's Church Membership /
  // Ministry Access Level split.
  await testDb.insert(member).values({
    id: `member-${userId}`,
    organizationId: churchA.id,
    userId,
    role: 'admin',
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
  eventTimeBlockId: string;
}

async function seedPlanningGraph(seed: SchedulingSeed): Promise<PlanningSeed> {
  const [cycleRow] = await testDb
    .insert(cycle)
    .values({
      churchId: seed.churchAId,
      name: 'August Plan',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
    })
    .returning();
  if (!cycleRow) throw new Error('Cycle seed failed');

  const [template] = await testDb
    .insert(eventTemplate)
    .values({ churchId: seed.churchAId, name: 'Sunday', weekday: 0 })
    .returning();
  if (!template) throw new Error('Template seed failed');
  const [block] = await testDb
    .insert(templateTimeBlock)
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
      cycleId: cycleRow.id,
      sourceTemplateId: template.id,
      title: 'Sunday Service',
      start: new Date('2026-08-09T12:00:00Z'),
      end: new Date('2026-08-09T14:00:00Z'),
    })
    .returning();
  if (!insertedEvent) throw new Error('Event seed failed');
  const [eventTimeBlockRow] = await testDb
    .insert(eventTimeBlock)
    .values({
      churchId: seed.churchAId,
      eventId: insertedEvent.id,
      sourceTemplateTimeBlockId: block.id,
      startTime: insertedEvent.start,
      endTime: insertedEvent.end,
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
  if (!eventTimeBlockRow || !participation)
    throw new Error('Event time block or participation failed');
  await testDb.insert(participationEventTimeBlockInclusion).values({
    churchId: seed.churchAId,
    participationId: participation.id,
    eventTimeBlockId: eventTimeBlockRow.id,
  });
  const [insertedShift] = await testDb
    .insert(shift)
    .values({
      churchId: seed.churchAId,
      participationId: participation.id,
      eventTimeBlockId: eventTimeBlockRow.id,
      startTime: eventTimeBlockRow.startTime,
      endTime: eventTimeBlockRow.endTime,
    })
    .returning();
  if (!insertedShift) throw new Error('Shift seed failed');

  return {
    cycleId: cycleRow.id,
    eventId: insertedEvent.id,
    participationId: participation.id,
    shiftId: insertedShift.id,
    eventTimeBlockId: eventTimeBlockRow.id,
  };
}

describe('Scheduling reshape schema', () => {
  beforeEach(clearDatabase, 120_000);

  it('stores cycle boundaries as dates', async () => {
    const seed = await seedSchedulingBase();
    const [inserted] = await testDb
      .insert(cycle)
      .values({
        churchId: seed.churchAId,
        name: 'Date-only cycle',
        startDate: new Date('2026-08-01T15:30:00Z'),
        endDate: new Date('2026-09-01T15:30:00Z'),
      })
      .returning();
    if (!inserted) throw new Error('Cycle seed failed');

    const [cycleRow] = await testDb
      .select()
      .from(cycle)
      .where(eq(cycle.id, inserted.id));

    expect(cycleRow?.startDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(cycleRow?.endDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('prevents overlapping cycles per church but allows another church', async () => {
    const seed = await seedSchedulingBase();
    await testDb.insert(cycle).values({
      churchId: seed.churchAId,
      name: 'A',
      startDate: new Date('2026-08-01T00:00:00Z'),
      endDate: new Date('2026-09-01T00:00:00Z'),
    });

    await expect(
      testDb.insert(cycle).values({
        churchId: seed.churchAId,
        name: 'Overlap',
        startDate: new Date('2026-08-15T00:00:00Z'),
        endDate: new Date('2026-09-15T00:00:00Z'),
      }),
    ).rejects.toThrow();
    await expect(
      testDb.insert(cycle).values({
        churchId: seed.churchBId,
        name: 'Other church',
        startDate: new Date('2026-08-15T00:00:00Z'),
        endDate: new Date('2026-09-15T00:00:00Z'),
      }),
    ).resolves.toBeDefined();
  });

  it('rejects shifts outside parent event time block bounds', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);

    await expect(
      testDb.insert(shift).values({
        churchId: seed.churchAId,
        participationId: graph.participationId,
        eventTimeBlockId: graph.eventTimeBlockId,
        startTime: new Date('2026-08-09T11:59:00Z'),
        endTime: new Date('2026-08-09T13:00:00Z'),
      }),
    ).rejects.toThrow();
  });

  it('re-keys requirements, assignments, and unavailable shifts to shifts', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);
    const [check] = await testDb
      .insert(availabilityCheck)
      .values({
        churchId: seed.churchAId,
        cycleId: graph.cycleId,
        ministryMembershipId: seed.membershipId,
      })
      .returning();
    if (!check) throw new Error('Availability check seed failed');

    const [stage] = await testDb
      .insert(sector)
      .values({
        churchId: seed.churchAId,
        ministryId: seed.ministryId,
        name: 'Stage',
      })
      .returning();
    if (!stage) throw new Error('Sector seed failed');
    const [requirement] = await testDb
      .insert(shiftRequirement)
      .values({
        churchId: seed.churchAId,
        participationId: graph.participationId,
        shiftId: graph.shiftId,
        roleId: seed.roleId,
        sectorId: stage.id,
        peopleNeeded: 1,
      })
      .returning();
    if (!requirement) throw new Error('Shift requirement seed failed');
    await testDb.insert(assignment).values({
      churchId: seed.churchAId,
      participationId: graph.participationId,
      shiftId: graph.shiftId,
      volunteerId: seed.volunteerId,
      roleId: seed.roleId,
      shiftRequirementId: requirement.id,
    });
    await testDb.insert(unavailableShift).values({
      churchId: seed.churchAId,
      availabilityCheckId: check.id,
      shiftId: graph.shiftId,
    });

    const unavailableShifts = await testDb
      .select()
      .from(unavailableShift)
      .where(eq(unavailableShift.availabilityCheckId, check.id));
    expect(unavailableShifts).toHaveLength(1);
  });

  it('cascades event deletion through participation scheduling data', async () => {
    const seed = await seedSchedulingBase();
    const graph = await seedPlanningGraph(seed);

    await testDb.delete(event).where(eq(event.id, graph.eventId));

    const [eventTimeBlocks, participations, shifts] = await Promise.all([
      testDb.select().from(eventTimeBlock),
      testDb.select().from(ministryParticipation),
      testDb.select().from(shift),
    ]);
    expect(eventTimeBlocks).toHaveLength(0);
    expect(participations).toHaveLength(0);
    expect(shifts).toHaveLength(0);
  });

  it('lets one user hold Church Membership at admin and Ministry Membership at leader independently', async () => {
    const seed = await seedSchedulingBase();

    // Church Membership (`member.role`) and Ministry Membership
    // (`ministry_membership.ministry_access_level`) are separate Scoped
    // Memberships in separate tables — holding one says nothing about the
    // other.
    const admins = await testDb
      .select()
      .from(member)
      .where(eq(member.userId, seed.userId));
    const memberships = await testDb
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.volunteerId, seed.volunteerId));

    expect(admins).toHaveLength(1);
    expect(admins[0]?.role).toBe('admin');
    expect(memberships[0]?.ministryAccessLevel).toBe('leader');
  });
});

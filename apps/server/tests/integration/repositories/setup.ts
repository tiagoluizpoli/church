import * as schema from '@church/db';
import {
  addChurchMember,
  assignment,
  assignmentAudit,
  createChurch,
  event,
  ministry,
  ministryParticipation,
  ministryVolunteer,
  ministryVolunteerRole,
  planningCycle,
  role,
  shift,
  slotRequirement,
  timeSlot,
  volunteer,
} from '@church/db';
import { getTestDatabaseUrl } from '@church/db/test-database-url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const DATABASE_URL = getTestDatabaseUrl();

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
export const testDb = drizzle(pool, { schema });

export const volunteerDashboardSeed = {
  churchId: '11111111-1111-1111-1111-111111111111',
  volunteerId: '44444444-4444-4444-4444-444444444441',
  ministryId: '33333333-3333-3333-3333-333333333331',
  hourlyEventId: '66666666-6666-6666-6666-666666666661',
  publishedEventId: '66666666-6666-6666-6666-666666666662',
  hourlySlotId: '77777777-7777-7777-7777-777777777771',
  publishedSlotId: '77777777-7777-7777-7777-777777777772',
  confirmedAssignmentId: '99999999-9999-9999-9999-999999999991',
} as const;

export const volunteerDashboardTimeline = {
  hourlyEventStart: new Date('2024-06-05T09:00:00Z'),
  hourlyEventEnd: new Date('2024-06-05T11:00:00Z'),
  publishedEventStart: new Date('2024-06-04T09:00:00Z'),
  publishedEventEnd: new Date('2024-06-04T11:00:00Z'),
} as const;

/**
 * Roots at `organization` and `user`, never at `church`. `church` is now an
 * extension row keyed by the organization id, so cascading from it leaves the
 * organization, its members and its invitations standing — which does not fail
 * here, it fails later as an unexplained authorization result in another spec.
 * `tests/tenancy/truncation-root.test.ts` guards this.
 */
export async function truncateAll(): Promise<void> {
  await testDb.execute(`
    TRUNCATE TABLE organization, "user", verification, todo RESTART IDENTITY CASCADE
  `);
}

/**
 * Seeds stable test data matching the IDs expected by all contract specs.
 * user-1 and user-2 are seeded directly into the `user` table as Better Auth
 * does not expose a programmatic API for tests.
 */
export async function seed(): Promise<void> {
  // Seed auth users (Better Auth table — raw insert)
  await testDb.execute(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES
      ('22222222-2222-2222-2222-222222222221', 'Alice Test', 'alice@test.com', true, now(), now()),
      ('22222222-2222-2222-2222-222222222222', 'Bob Test', 'bob@test.com', true, now(), now()),
      ('22222222-2222-2222-2222-222222222223', 'Carol Test', 'carol@test.com', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

  // Churches — an organization row plus its extension row, not a bare church.
  await createChurch({
    db: testDb,
    id: '11111111-1111-1111-1111-111111111111',
    name: 'First Church',
    slug: 'first-church',
    timezone: 'UTC',
  });
  await createChurch({
    db: testDb,
    id: '11111111-1111-1111-1111-111111111112',
    name: 'Second Church',
    slug: 'second-church',
    timezone: 'UTC',
  });

  // Church Membership: Alice administers church 1, Bob is a plain member.
  await addChurchMember({
    db: testDb,
    churchId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222221',
    accessLevel: 'admin',
  });
  await addChurchMember({
    db: testDb,
    churchId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    accessLevel: 'member',
  });

  // Ministries (church-1 only — alphabetical for list test: Adult first, Youth second)
  await testDb.insert(ministry).values([
    {
      id: '33333333-3333-3333-3333-333333333331',
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Adult Ministry',
      enforcementType: 'soft',
    },
    {
      id: '33333333-3333-3333-3333-333333333332',
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Youth Ministry',
      enforcementType: 'hard',
    },
  ]);

  // Roles (ministry-1: Greeter + Usher — alphabetical for list test)
  await testDb.insert(role).values([
    {
      id: '55555555-5555-5555-5555-555555555551',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      name: 'Usher',
    },
    {
      id: '55555555-5555-5555-5555-555555555552',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      name: 'Greeter',
    },
  ]);

  // Volunteers
  await testDb.insert(volunteer).values([
    {
      id: '44444444-4444-4444-4444-444444444441',
      churchId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222221',
      status: 'active',
    },
    {
      id: '44444444-4444-4444-4444-444444444442',
      churchId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      status: 'active',
    },
    // Retired profile — Carol left church-1. Kept forever (never moved or
    // deleted) so her historical assignments stay attributed here; every
    // volunteer-by-user read must exclude her.
    {
      id: '44444444-4444-4444-4444-444444444443',
      churchId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222223',
      status: 'active',
      leftAt: new Date('2024-01-01T00:00:00Z'),
    },
  ]);

  // Ministry memberships (volunteer-1 in ministry-1 only)
  await testDb.insert(ministryVolunteer).values([
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      ministryId: '33333333-3333-3333-3333-333333333331',
      ministryAccessLevel: 'volunteer',
      status: 'active',
    },
  ]);

  // Role qualifications. Qualification hangs off the membership and is an
  // explicit grant — membership alone no longer implies it, so volunteer-1 is
  // qualified for Usher (role-1) and for nothing else.
  await testDb.insert(ministryVolunteerRole).values([
    {
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryVolunteerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      roleId: '55555555-5555-5555-5555-555555555551',
    },
  ]);

  await testDb.insert(planningCycle).values({
    id: '22222222-2222-2222-2222-222222222231',
    churchId: '11111111-1111-1111-1111-111111111111',
    name: 'June cycle',
    startDate: new Date('2024-06-01T00:00:00Z'),
    endDate: new Date('2024-07-01T00:00:00Z'),
  });

  // Events (event-2 June 4 = older, event-1 June 5 = newer; list ascending by start_date returns event-2 first)
  await testDb.insert(event).values([
    {
      id: '66666666-6666-6666-6666-666666666661',
      churchId: '11111111-1111-1111-1111-111111111111',
      planningCycleId: '22222222-2222-2222-2222-222222222231',
      title: 'Youth Gathering',
      startDate: new Date('2024-06-05T09:00:00Z'),
      endDate: new Date('2024-06-05T11:00:00Z'),
      status: 'draft',
    },
    {
      id: '66666666-6666-6666-6666-666666666662',
      churchId: '11111111-1111-1111-1111-111111111111',
      planningCycleId: '22222222-2222-2222-2222-222222222231',
      title: 'Adult Service',
      startDate: new Date('2024-06-04T09:00:00Z'),
      endDate: new Date('2024-06-04T11:00:00Z'),
      status: 'scheduled',
    },
  ]);

  await testDb.insert(ministryParticipation).values([
    {
      id: '61616161-6161-6161-6161-616161616161',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      eventId: '66666666-6666-6666-6666-666666666661',
    },
    {
      id: '61616161-6161-6161-6161-616161616162',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      eventId: '66666666-6666-6666-6666-666666666662',
      state: 'published',
    },
  ]);

  // Time slot (slot-1 for event-1 with 1 slot requirement)
  await testDb.insert(timeSlot).values([
    {
      id: '77777777-7777-7777-7777-777777777771',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId: '66666666-6666-6666-6666-666666666661',
      startTime: new Date('2024-06-05T09:00:00Z'),
      endTime: new Date('2024-06-05T11:00:00Z'),
      label: 'Morning Service',
    },
    {
      id: '77777777-7777-7777-7777-777777777772',
      churchId: '11111111-1111-1111-1111-111111111111',
      eventId: '66666666-6666-6666-6666-666666666662',
      startTime: new Date('2024-06-05T11:00:00Z'),
      endTime: new Date('2024-06-05T13:00:00Z'),
      label: 'Afternoon Service',
    },
  ]);

  await testDb.insert(shift).values([
    {
      id: '71717171-7171-7171-7171-717171717171',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616161',
      timeSlotId: '77777777-7777-7777-7777-777777777771',
      startTime: new Date('2024-06-05T09:00:00Z'),
      endTime: new Date('2024-06-05T11:00:00Z'),
    },
    {
      id: '71717171-7171-7171-7171-717171717172',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616162',
      timeSlotId: '77777777-7777-7777-7777-777777777772',
      startTime: new Date('2024-06-05T11:00:00Z'),
      endTime: new Date('2024-06-05T13:00:00Z'),
    },
  ]);

  await testDb.insert(slotRequirement).values([
    {
      id: '88888888-8888-8888-8888-888888888881',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616161',
      shiftId: '71717171-7171-7171-7171-717171717171',
      roleId: '55555555-5555-5555-5555-555555555551',
      requiredCount: 2,
    },
  ]);

  // Assignments (assignment-1 confirmed, assignment-2 declined for slot-1)
  await testDb.insert(assignment).values([
    {
      id: '99999999-9999-9999-9999-999999999991',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616161',
      shiftId: '71717171-7171-7171-7171-717171717171',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'confirmed',
      assignedAt: new Date('2024-06-01T10:00:00Z'),
      assignedBy: '22222222-2222-2222-2222-222222222221',
    },
    {
      id: '99999999-9999-9999-9999-999999999992',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616161',
      shiftId: '71717171-7171-7171-7171-717171717171',
      volunteerId: '44444444-4444-4444-4444-444444444442',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'declined',
      assignedAt: new Date('2024-06-01T10:05:00Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999999993',
      churchId: '11111111-1111-1111-1111-111111111111',
      participationId: '61616161-6161-6161-6161-616161616162',
      shiftId: '71717171-7171-7171-7171-717171717172',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'confirmed',
      assignedAt: new Date('2024-06-01T10:10:00Z'),
      assignedBy: '22222222-2222-2222-2222-222222222221',
    },
  ]);

  // Assignment audits (newest first: audit-2 at 11:00, audit-1 at 10:00)
  await testDb.insert(assignmentAudit).values([
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      churchId: '11111111-1111-1111-1111-111111111111',
      assignmentId: '99999999-9999-9999-9999-999999999991',
      actorId: '22222222-2222-2222-2222-222222222221',
      action: 'created',
      timestamp: new Date('2024-06-01T10:00:00Z'),
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
      churchId: '11111111-1111-1111-1111-111111111111',
      assignmentId: '99999999-9999-9999-9999-999999999991',
      actorId: '22222222-2222-2222-2222-222222222221',
      action: 'status_change',
      timestamp: new Date('2024-06-01T11:00:00Z'),
    },
  ]);
}

export async function seedVolunteerDashboardScenario(): Promise<
  typeof volunteerDashboardSeed
> {
  await truncateAll();
  await seed();

  return volunteerDashboardSeed;
}

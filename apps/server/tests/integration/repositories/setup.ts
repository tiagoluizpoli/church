import * as schema from '@church/db';
import {
  assignment,
  assignmentAudit,
  availability,
  church,
  event,
  ministry,
  ministryVolunteer,
  role,
  slotRequirement,
  timeSlot,
  volunteer,
} from '@church/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5444/church_test';

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
export const testDb = drizzle(pool, { schema });

export async function truncateAll(): Promise<void> {
  await testDb.execute(`
    TRUNCATE TABLE
      assignment_audit,
      assignment,
      availability,
      slot_requirement,
      time_slot,
      event,
      ministry_volunteer,
      role,
      volunteer,
      ministry,
      church,
      "user"
    RESTART IDENTITY CASCADE
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
      ('22222222-2222-2222-2222-222222222222', 'Bob Test', 'bob@test.com', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

  // Churches
  await testDb.insert(church).values([
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'First Church',
      slug: 'first-church',
      timezone: 'UTC',
    },
    {
      id: '11111111-1111-1111-1111-111111111112',
      name: 'Second Church',
      slug: 'second-church',
      timezone: 'UTC',
    },
  ]);

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
      isGlobal: false,
    },
    {
      id: '55555555-5555-5555-5555-555555555552',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      name: 'Greeter',
      isGlobal: false,
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
  ]);

  // Ministry memberships (volunteer-1 in ministry-1 only)
  await testDb.insert(ministryVolunteer).values([
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      ministryId: '33333333-3333-3333-3333-333333333331',
      systemRole: 'volunteer',
      status: 'active',
    },
  ]);

  // Events (event-2 June 4 = older, event-1 June 5 = newer; list ascending by start_date returns event-2 first)
  await testDb.insert(event).values([
    {
      id: '66666666-6666-6666-6666-666666666661',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      title: 'Youth Gathering',
      startDate: new Date('2024-06-05T09:00:00Z'),
      endDate: new Date('2024-06-05T11:00:00Z'),
      status: 'draft',
    },
    {
      id: '66666666-6666-6666-6666-666666666662',
      churchId: '11111111-1111-1111-1111-111111111111',
      ministryId: '33333333-3333-3333-3333-333333333331',
      title: 'Adult Service',
      startDate: new Date('2024-06-04T09:00:00Z'),
      endDate: new Date('2024-06-04T11:00:00Z'),
      status: 'published',
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

  await testDb.insert(slotRequirement).values([
    {
      id: '88888888-8888-8888-8888-888888888881',
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId: '77777777-7777-7777-7777-777777777771',
      roleId: '55555555-5555-5555-5555-555555555551',
      requiredCount: 2,
    },
  ]);

  // Assignments (assignment-1 confirmed, assignment-2 declined for slot-1)
  await testDb.insert(assignment).values([
    {
      id: '99999999-9999-9999-9999-999999999991',
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId: '77777777-7777-7777-7777-777777777771',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'confirmed',
      assignedAt: new Date('2024-06-01T10:00:00Z'),
      assignedBy: '22222222-2222-2222-2222-222222222221',
    },
    {
      id: '99999999-9999-9999-9999-999999999992',
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId: '77777777-7777-7777-7777-777777777771',
      volunteerId: '44444444-4444-4444-4444-444444444442',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'declined',
      assignedAt: new Date('2024-06-01T10:05:00Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999999993',
      churchId: '11111111-1111-1111-1111-111111111111',
      slotId: '77777777-7777-7777-7777-777777777772',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      roleId: '55555555-5555-5555-5555-555555555551',
      status: 'confirmed',
      assignedAt: new Date('2024-06-01T10:10:00Z'),
      assignedBy: '22222222-2222-2222-2222-222222222221',
    },
  ]);

  // Availability (volunteer-1, overlapping with June 1 09:00-13:00 UTC)
  await testDb.insert(availability).values([
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      churchId: '11111111-1111-1111-1111-111111111111',
      volunteerId: '44444444-4444-4444-4444-444444444441',
      type: 'available',
      startTime: new Date('2024-06-01T10:00:00Z'),
      endTime: new Date('2024-06-01T12:00:00Z'),
      isAllDay: false,
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

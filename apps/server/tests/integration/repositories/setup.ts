import * as schema from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { parseCalendarDay, parseInstant } from '@church/time';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import {
  buildChurch,
  buildChurchMembership,
} from '../../../seeds/builders/church';
import { buildUser } from '../../../seeds/builders/identity';
import { buildMinistry, buildRole } from '../../../seeds/builders/ministry';
import {
  buildAssignment,
  buildAssignmentAudit,
  buildEvent,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
} from '../../../seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../../seeds/builders/volunteer';

const DATABASE_URL = getIntegrationDatabaseUrl();

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
 * user-1..user-3 are plain verified Users (no credential account): the specs
 * act as them but never sign in. Construction comes from the shared seed
 * builders; the identifiers and values below are this suite's own intent.
 */
export async function seed(): Promise<void> {
  const churchId = '11111111-1111-1111-1111-111111111111';
  const aliceId = '22222222-2222-2222-2222-222222222221';
  const bobId = '22222222-2222-2222-2222-222222222222';
  const carolId = '22222222-2222-2222-2222-222222222223';
  const adultMinistryId = '33333333-3333-3333-3333-333333333331';
  const usherRoleId = '55555555-5555-5555-5555-555555555551';
  const volunteerOneId = '44444444-4444-4444-4444-444444444441';
  const volunteerTwoId = '44444444-4444-4444-4444-444444444442';
  const youthGatheringId = '66666666-6666-6666-6666-666666666661';
  const adultServiceId = '66666666-6666-6666-6666-666666666662';
  const morningSlotId = '77777777-7777-7777-7777-777777777771';
  const afternoonSlotId = '77777777-7777-7777-7777-777777777772';
  const youthParticipationId = '61616161-6161-6161-6161-616161616161';
  const adultParticipationId = '61616161-6161-6161-6161-616161616162';
  const morningShiftId = '71717171-7171-7171-7171-717171717171';
  const afternoonShiftId = '71717171-7171-7171-7171-717171717172';
  const confirmedAssignmentId = '99999999-9999-9999-9999-999999999991';

  const jun1At10 = parseInstant({ value: '2024-06-01T10:00:00Z' });
  const jun4At09 = parseInstant({ value: '2024-06-04T09:00:00Z' });
  const jun4At11 = parseInstant({ value: '2024-06-04T11:00:00Z' });
  const jun5At09 = parseInstant({ value: '2024-06-05T09:00:00Z' });
  const jun5At11 = parseInstant({ value: '2024-06-05T11:00:00Z' });
  const jun5At13 = parseInstant({ value: '2024-06-05T13:00:00Z' });

  await buildUser({
    db: testDb,
    id: aliceId,
    name: 'Alice Test',
    email: 'alice@test.com',
  });
  await buildUser({
    db: testDb,
    id: bobId,
    name: 'Bob Test',
    email: 'bob@test.com',
  });
  await buildUser({
    db: testDb,
    id: carolId,
    name: 'Carol Test',
    email: 'carol@test.com',
  });

  // Churches — an organization row plus its extension row, not a bare church.
  await buildChurch({
    db: testDb,
    id: churchId,
    name: 'First Church',
    slug: 'first-church',
    timezone: 'UTC',
  });
  await buildChurch({
    db: testDb,
    id: '11111111-1111-1111-1111-111111111112',
    name: 'Second Church',
    slug: 'second-church',
    timezone: 'UTC',
  });

  // Church Membership: Alice administers church 1, Bob is a plain member.
  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: aliceId,
    accessLevel: 'admin',
  });
  await buildChurchMembership({
    db: testDb,
    churchId,
    userId: bobId,
    accessLevel: 'member',
  });

  // Ministries (church-1 only — alphabetical for list test: Adult first, Youth second)
  await buildMinistry({
    db: testDb,
    churchId,
    id: adultMinistryId,
    name: 'Adult Ministry',
    enforcementType: 'soft',
  });
  await buildMinistry({
    db: testDb,
    churchId,
    id: '33333333-3333-3333-3333-333333333332',
    name: 'Youth Ministry',
    enforcementType: 'hard',
  });

  // Roles (ministry-1: Greeter + Usher — alphabetical for list test)
  await buildRole({
    db: testDb,
    churchId,
    ministryId: adultMinistryId,
    id: usherRoleId,
    name: 'Usher',
  });
  await buildRole({
    db: testDb,
    churchId,
    ministryId: adultMinistryId,
    id: '55555555-5555-5555-5555-555555555552',
    name: 'Greeter',
  });

  // Volunteers
  await buildVolunteer({
    db: testDb,
    churchId,
    userId: aliceId,
    id: volunteerOneId,
  });
  await buildVolunteer({
    db: testDb,
    churchId,
    userId: bobId,
    id: volunteerTwoId,
  });
  // Retired profile — Carol left church-1. Kept forever (never moved or
  // deleted) so her historical assignments stay attributed here; every
  // volunteer-by-user read must exclude her.
  await buildVolunteer({
    db: testDb,
    churchId,
    userId: carolId,
    id: '44444444-4444-4444-4444-444444444443',
    leftAt: parseInstant({ value: '2024-01-01T00:00:00Z' }),
  });

  // Ministry memberships (volunteer-1 in ministry-1 only). Qualification
  // hangs off the membership and is an explicit grant — membership alone no
  // longer implies it, so volunteer-1 is qualified for Usher (role-1) and for
  // nothing else.
  await buildMinistryMembership({
    db: testDb,
    churchId,
    volunteerId: volunteerOneId,
    ministryId: adultMinistryId,
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    ministryAccessLevel: 'volunteer',
    roleIds: [usherRoleId],
    teams: [],
  });

  const cycle = await buildPlanningCycle({
    db: testDb,
    churchId,
    id: '22222222-2222-2222-2222-222222222231',
    name: 'June cycle',
    startDate: parseCalendarDay({ value: '2024-06-01' }),
    endDate: parseCalendarDay({ value: '2024-07-01' }),
    state: 'draft',
  });

  // Events (event-2 June 4 = older, event-1 June 5 = newer; list ascending by start returns event-2 first)
  await buildEvent({
    db: testDb,
    churchId,
    planningCycleId: cycle.id,
    id: youthGatheringId,
    title: 'Youth Gathering',
    start: jun5At09,
    end: jun5At11,
    status: 'draft',
  });
  await buildEvent({
    db: testDb,
    churchId,
    planningCycleId: cycle.id,
    id: adultServiceId,
    title: 'Adult Service',
    start: jun4At09,
    end: jun4At11,
    status: 'scheduled',
  });

  // Time slots (slot-1 for event-1 with 1 slot requirement)
  await buildTimeSlot({
    db: testDb,
    churchId,
    eventId: youthGatheringId,
    id: morningSlotId,
    start: jun5At09,
    end: jun5At11,
    label: 'Morning Service',
  });
  await buildTimeSlot({
    db: testDb,
    churchId,
    eventId: adultServiceId,
    id: afternoonSlotId,
    start: jun5At11,
    end: jun5At13,
    label: 'Afternoon Service',
  });

  await buildMinistryParticipation({
    db: testDb,
    churchId,
    ministryId: adultMinistryId,
    eventId: youthGatheringId,
    id: youthParticipationId,
    state: 'tailoring',
    timeSlotIds: [],
  });
  await buildMinistryParticipation({
    db: testDb,
    churchId,
    ministryId: adultMinistryId,
    eventId: adultServiceId,
    id: adultParticipationId,
    state: 'published',
    timeSlotIds: [],
  });

  await buildShift({
    db: testDb,
    churchId,
    participationId: youthParticipationId,
    timeSlotId: morningSlotId,
    id: morningShiftId,
    start: jun5At09,
    end: jun5At11,
  });
  await buildShift({
    db: testDb,
    churchId,
    participationId: adultParticipationId,
    timeSlotId: afternoonSlotId,
    id: afternoonShiftId,
    start: jun5At11,
    end: jun5At13,
  });

  await buildSlotRequirement({
    db: testDb,
    churchId,
    participationId: youthParticipationId,
    shiftId: morningShiftId,
    roleId: usherRoleId,
    id: '88888888-8888-8888-8888-888888888881',
    requiredCount: 2,
  });

  // Assignments (assignment-1 confirmed, assignment-2 declined for slot-1)
  await buildAssignment({
    db: testDb,
    churchId,
    participationId: youthParticipationId,
    shiftId: morningShiftId,
    volunteerId: volunteerOneId,
    roleId: usherRoleId,
    id: confirmedAssignmentId,
    status: 'confirmed',
    assignedAt: jun1At10,
    assignedBy: aliceId,
  });
  await buildAssignment({
    db: testDb,
    churchId,
    participationId: youthParticipationId,
    shiftId: morningShiftId,
    volunteerId: volunteerTwoId,
    roleId: usherRoleId,
    id: '99999999-9999-9999-9999-999999999992',
    status: 'declined',
    assignedAt: parseInstant({ value: '2024-06-01T10:05:00Z' }),
  });
  await buildAssignment({
    db: testDb,
    churchId,
    participationId: adultParticipationId,
    shiftId: afternoonShiftId,
    volunteerId: volunteerOneId,
    roleId: usherRoleId,
    id: '99999999-9999-9999-9999-999999999993',
    status: 'confirmed',
    assignedAt: parseInstant({ value: '2024-06-01T10:10:00Z' }),
    assignedBy: aliceId,
  });

  // Assignment audits (newest first: audit-2 at 11:00, audit-1 at 10:00)
  await buildAssignmentAudit({
    db: testDb,
    churchId,
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    assignmentId: confirmedAssignmentId,
    actorId: aliceId,
    action: 'created',
    occurredAt: jun1At10,
  });
  await buildAssignmentAudit({
    db: testDb,
    churchId,
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    assignmentId: confirmedAssignmentId,
    actorId: aliceId,
    action: 'status_change',
    occurredAt: parseInstant({ value: '2024-06-01T11:00:00Z' }),
  });
}

export async function seedVolunteerDashboardScenario(): Promise<
  typeof volunteerDashboardSeed
> {
  await truncateAll();
  await seed();

  return volunteerDashboardSeed;
}

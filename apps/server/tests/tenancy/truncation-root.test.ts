import {
  account,
  addChurchMember,
  assignment,
  assignmentAudit,
  availability,
  availabilityCheck,
  createChurch,
  event,
  eventTemplate,
  identityAudit,
  invitation,
  invitationVerificationCode,
  ministry,
  ministryInvitation,
  ministryInvitationRole,
  ministryParticipation,
  ministryServingProfile,
  ministryVolunteer,
  ministryVolunteerRole,
  ministryVolunteerTeam,
  outboxMessage,
  participationSlotInclusion,
  planningCycle,
  role,
  securityLog,
  session,
  shift,
  slotRequirement,
  team,
  timeBlock,
  timeSlot,
  todo,
  user,
  verification,
  volunteer,
  volunteerNotification,
} from '@church/db';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { testDb, truncateAll } from '../integration/repositories/setup';

/**
 * `truncateAll` roots at `organization` and `user`. Rooting it at `church`
 * instead — the obvious choice while `church` still owned Church identity —
 * now leaves `organization`, `member` and `invitation` standing, and that debris
 * does not fail here: it fails later, as an unexplained authorization result in
 * some other spec.
 *
 * So this fixture writes a row into every table the truncation is expected to
 * reach, and the assertions are driven off `information_schema` rather than a
 * hand-kept list. A table added to the schema and not covered here fails this
 * test, which is the point.
 */

const IDS = {
  church: 'aaaaaaa1-0000-4000-8000-000000000001',
  user: 'truncation-root-user',
  ministry: 'aaaaaaa1-0000-4000-8000-000000000002',
  team: 'aaaaaaa1-0000-4000-8000-000000000003',
  role: 'aaaaaaa1-0000-4000-8000-000000000004',
  volunteer: 'aaaaaaa1-0000-4000-8000-000000000005',
  membership: 'aaaaaaa1-0000-4000-8000-000000000006',
  planningCycle: 'aaaaaaa1-0000-4000-8000-000000000007',
  eventTemplate: 'aaaaaaa1-0000-4000-8000-000000000008',
  timeBlock: 'aaaaaaa1-0000-4000-8000-000000000009',
  event: 'aaaaaaa1-0000-4000-8000-00000000000a',
  timeSlot: 'aaaaaaa1-0000-4000-8000-00000000000b',
  participation: 'aaaaaaa1-0000-4000-8000-00000000000c',
  shift: 'aaaaaaa1-0000-4000-8000-00000000000d',
  assignment: 'aaaaaaa1-0000-4000-8000-00000000000e',
  availabilityCheck: 'aaaaaaa1-0000-4000-8000-00000000000f',
  ministryInvitation: 'aaaaaaa1-0000-4000-8000-000000000010',
  outboxMessage: 'aaaaaaa1-0000-4000-8000-000000000011',
} as const;

interface TableRowCount {
  table: string;
  count: number;
}

type TableNameRow = Record<string, unknown> & {
  tableName: string;
};

type RowCountRow = Record<string, unknown> & {
  rowCount: string;
};

async function listPublicTables(): Promise<string[]> {
  const result = await testDb.execute<TableNameRow>(sql`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((row) => row.tableName);
}

async function countRows(tables: string[]): Promise<TableRowCount[]> {
  const counts: TableRowCount[] = [];
  for (const table of tables) {
    const result = await testDb.execute<RowCountRow>(
      sql`SELECT count(*)::text AS "rowCount" FROM ${sql.identifier(table)}`,
    );
    counts.push({ table, count: Number(result.rows[0]?.rowCount ?? '0') });
  }
  return counts;
}

/** One row in every table the truncation must reach. */
async function seedEveryTenantedTable(): Promise<void> {
  await createChurch({
    db: testDb,
    id: IDS.church,
    name: 'Truncation Root Church',
    slug: 'truncation-root-church',
  });

  await testDb.insert(user).values({
    id: IDS.user,
    name: 'Truncation Root User',
    email: 'truncation-root@test.com',
    emailVerified: true,
  });

  await addChurchMember({
    db: testDb,
    churchId: IDS.church,
    userId: IDS.user,
    accessLevel: 'admin',
  });

  await testDb.insert(invitation).values({
    id: 'truncation-root-invitation',
    organizationId: IDS.church,
    email: 'invited@test.com',
    role: 'member',
    status: 'pending',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    inviterId: IDS.user,
  });

  await testDb.insert(session).values({
    id: 'truncation-root-session',
    token: 'truncation-root-token',
    userId: IDS.user,
    activeOrganizationId: IDS.church,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date(),
  });

  await testDb.insert(account).values({
    id: 'truncation-root-account',
    accountId: IDS.user,
    providerId: 'credential',
    userId: IDS.user,
    updatedAt: new Date(),
  });

  await testDb.insert(verification).values({
    id: 'truncation-root-verification',
    identifier: 'truncation-root@test.com',
    value: 'one-time-token',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  });

  await testDb.insert(todo).values({ text: 'Truncation root todo' });

  await testDb.insert(ministry).values({
    id: IDS.ministry,
    churchId: IDS.church,
    name: 'Truncation Ministry',
  });

  await testDb.insert(team).values({
    id: IDS.team,
    churchId: IDS.church,
    ministryId: IDS.ministry,
    name: 'Truncation Team',
  });

  await testDb.insert(role).values({
    id: IDS.role,
    churchId: IDS.church,
    ministryId: IDS.ministry,
    name: 'Truncation Role',
  });

  await testDb.insert(volunteer).values({
    id: IDS.volunteer,
    churchId: IDS.church,
    userId: IDS.user,
    status: 'active',
  });

  await testDb.insert(ministryVolunteer).values({
    id: IDS.membership,
    churchId: IDS.church,
    ministryId: IDS.ministry,
    volunteerId: IDS.volunteer,
  });

  await testDb.insert(ministryVolunteerRole).values({
    churchId: IDS.church,
    ministryVolunteerId: IDS.membership,
    roleId: IDS.role,
  });

  await testDb.insert(ministryVolunteerTeam).values({
    churchId: IDS.church,
    ministryVolunteerId: IDS.membership,
    teamId: IDS.team,
  });

  await testDb.insert(ministryInvitation).values({
    id: IDS.ministryInvitation,
    churchId: IDS.church,
    ministryId: IDS.ministry,
    inviteeUserId: IDS.user,
    ministryAccessLevel: 'volunteer',
    inviterId: IDS.user,
    expiresAt: new Date('2030-01-01T00:00:00Z'),
  });

  await testDb.insert(invitationVerificationCode).values({
    ministryInvitationId: IDS.ministryInvitation,
    codeHash: 'truncation-root-verification-code-hash',
    expiresAt: new Date('2030-01-01T00:00:00Z'),
    lastSentAt: new Date('2030-01-01T00:00:00Z'),
  });

  await testDb.insert(ministryInvitationRole).values({
    churchId: IDS.church,
    ministryInvitationId: IDS.ministryInvitation,
    roleId: IDS.role,
  });

  await testDb.insert(outboxMessage).values({
    id: IDS.outboxMessage,
    churchId: IDS.church,
    kind: 'invitation.ministry',
    payload: { ministryInvitationId: IDS.ministryInvitation },
    scheduledFor: new Date('2030-01-01T00:00:00Z'),
    correlationId: 'truncation-root-correlation',
  });

  await testDb.insert(planningCycle).values({
    id: IDS.planningCycle,
    churchId: IDS.church,
    name: 'Truncation cycle',
    startDate: new Date('2026-06-01T00:00:00Z'),
    endDate: new Date('2026-07-01T00:00:00Z'),
  });

  await testDb.insert(eventTemplate).values({
    id: IDS.eventTemplate,
    churchId: IDS.church,
    name: 'Truncation template',
    weekday: 0,
  });

  await testDb.insert(timeBlock).values({
    id: IDS.timeBlock,
    churchId: IDS.church,
    templateId: IDS.eventTemplate,
    label: 'Morning',
    startTime: '09:00:00',
    endTime: '11:00:00',
    order: 0,
  });

  await testDb.insert(ministryServingProfile).values({
    churchId: IDS.church,
    ministryId: IDS.ministry,
    sourceTemplateBlockId: IDS.timeBlock,
    shiftSplit: { kind: 'equal', count: 1 },
  });

  await testDb.insert(event).values({
    id: IDS.event,
    churchId: IDS.church,
    planningCycleId: IDS.planningCycle,
    title: 'Truncation event',
    startDate: new Date('2026-06-07T09:00:00Z'),
    endDate: new Date('2026-06-07T11:00:00Z'),
  });

  await testDb.insert(timeSlot).values({
    id: IDS.timeSlot,
    churchId: IDS.church,
    eventId: IDS.event,
    startTime: new Date('2026-06-07T09:00:00Z'),
    endTime: new Date('2026-06-07T11:00:00Z'),
  });

  await testDb.insert(ministryParticipation).values({
    id: IDS.participation,
    churchId: IDS.church,
    ministryId: IDS.ministry,
    eventId: IDS.event,
  });

  await testDb.insert(participationSlotInclusion).values({
    churchId: IDS.church,
    participationId: IDS.participation,
    timeSlotId: IDS.timeSlot,
  });

  await testDb.insert(shift).values({
    id: IDS.shift,
    churchId: IDS.church,
    participationId: IDS.participation,
    timeSlotId: IDS.timeSlot,
    startTime: new Date('2026-06-07T09:00:00Z'),
    endTime: new Date('2026-06-07T11:00:00Z'),
  });

  await testDb.insert(slotRequirement).values({
    churchId: IDS.church,
    participationId: IDS.participation,
    shiftId: IDS.shift,
    roleId: IDS.role,
    requiredCount: 1,
  });

  await testDb.insert(assignment).values({
    id: IDS.assignment,
    churchId: IDS.church,
    participationId: IDS.participation,
    shiftId: IDS.shift,
    volunteerId: IDS.volunteer,
    roleId: IDS.role,
    status: 'confirmed',
    assignedBy: IDS.user,
  });

  await testDb.insert(assignmentAudit).values({
    churchId: IDS.church,
    assignmentId: IDS.assignment,
    actorId: IDS.user,
    action: 'created',
  });

  await testDb.insert(availabilityCheck).values({
    id: IDS.availabilityCheck,
    churchId: IDS.church,
    planningCycleId: IDS.planningCycle,
    ministryVolunteerId: IDS.membership,
  });

  await testDb.insert(availability).values({
    churchId: IDS.church,
    availabilityCheckId: IDS.availabilityCheck,
    shiftId: IDS.shift,
  });

  await testDb.insert(volunteerNotification).values({
    churchId: IDS.church,
    volunteerId: IDS.volunteer,
    planningCycleId: IDS.planningCycle,
    ministryId: IDS.ministry,
    eventId: IDS.event,
    assignmentId: IDS.assignment,
    type: 'assignment_reminder',
    title: 'Truncation notification',
    body: 'Truncation notification body',
    payload: {},
  });

  await testDb.insert(identityAudit).values({
    churchId: IDS.church,
    ministryInvitationId: IDS.ministryInvitation,
    actorId: IDS.user,
    action: 'acceptance',
    correlationId: 'truncation-root-identity-audit',
  });

  await testDb.insert(securityLog).values({
    churchId: IDS.church,
    ministryInvitationId: IDS.ministryInvitation,
    actorId: IDS.user,
    event: 'identity_mismatch',
    correlationId: 'truncation-root-security-log',
  });
}

describe('truncateAll roots at organization and user', () => {
  let tables: string[] = [];
  let countsAfterSeed: TableRowCount[] = [];
  let countsAfterTruncate: TableRowCount[] = [];

  beforeAll(async () => {
    await truncateAll();
    await seedEveryTenantedTable();

    const allTables = await listPublicTables();
    tables = allTables;

    countsAfterSeed = await countRows(tables);
    await truncateAll();
    countsAfterTruncate = await countRows(tables);
  });

  it('covers every table the truncation is expected to reach', () => {
    const empty = countsAfterSeed
      .filter((row) => row.count === 0)
      .map((row) => row.table);
    expect(empty, 'these tables are not covered by the fixture').toEqual([]);
  });

  it('leaves every one of them empty', () => {
    const surviving = countsAfterTruncate
      .filter((row) => row.count > 0)
      .map((row) => row.table);
    expect(surviving, 'truncation did not reach these tables').toEqual([]);
  });
});

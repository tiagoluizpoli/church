import {
  assignment,
  assignmentAudit,
  availability,
  church,
  member,
  ministryVolunteerRole,
  organization,
  participationSlotInclusion,
  volunteer,
} from '@church/db';
import { getIntegrationDatabaseUrl } from '@church/db/integration-database-url';
import { parseCalendarDay, parseInstant } from '@church/time';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildChurch,
  buildChurchMembership,
  buildProvisionedChurch,
} from '../../seeds/builders/church';
import { buildUser } from '../../seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildTeam,
} from '../../seeds/builders/ministry';
import {
  buildAssignedShift,
  buildAssignment,
  buildAssignmentAudit,
  buildAvailability,
  buildAvailabilityCheck,
  buildEvent,
  buildEventTemplate,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
} from '../../seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../seeds/builders/volunteer';
import { testDb, truncateAll } from '../integration/repositories/setup';

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER_ID = 'builders-admin';
const VOLUNTEER_USER_ID = 'builders-volunteer';

/**
 * The shared builders compose representative graphs against the explicit
 * integration database. The seed-contract assertion set lives in the recipe
 * suites; these cases only prove each shape composes and reads back through
 * the tables that own it.
 */
describe('integration composition of the shared seed builders', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('writes only to the integration-purpose database', async () => {
    const url = new URL(getIntegrationDatabaseUrl());
    const [row] = (await testDb.execute(sql`select current_database() as name`))
      .rows;

    expect(row?.name).toBe(url.pathname.slice(1));
    expect(row?.name).toMatch(/_int$/);
  });

  it('provisions a Church through the real Church Provisioning operation', async () => {
    const provisioned = await buildProvisionedChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Provisioned Church',
      slug: 'provisioned-church',
      timezone: 'America/Sao_Paulo',
      adminEmail: 'admin@provisioned.test',
      adminInvitationId: '99999999-9999-4999-8999-999999999999',
    });

    const [row] = await testDb
      .select({
        slug: organization.slug,
        timezone: church.timezone,
      })
      .from(organization)
      .innerJoin(church, eq(church.id, organization.id))
      .where(eq(organization.id, provisioned.church.id));
    expect(row).toEqual({
      slug: 'provisioned-church',
      timezone: 'America/Sao_Paulo',
    });
  });

  it('builds a direct-state Church with a Church Membership for a User', async () => {
    await buildUser({
      db: testDb,
      id: ADMIN_USER_ID,
      name: 'Admin',
      email: 'Admin@Builders.test',
    });
    const built = await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    await buildChurchMembership({
      db: testDb,
      churchId: built.id,
      userId: ADMIN_USER_ID,
      accessLevel: 'admin',
    });

    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, built.id));
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: ADMIN_USER_ID, role: 'admin' });
  });

  it('builds a Ministry structure of Teams and Roles inside one Church', async () => {
    await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    const ministry = await buildMinistry({
      db: testDb,
      churchId: CHURCH_ID,
      id: '33333333-3333-4333-8333-333333333331',
      name: 'Hospitality',
      enforcementType: 'hard',
    });
    const team = await buildTeam({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      id: '33333333-3333-4333-8333-333333333341',
      name: 'Door team',
    });
    const role = await buildRole({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      id: '33333333-3333-4333-8333-333333333351',
      name: 'Usher',
    });

    expect(ministry.enforcementType).toBe('hard');
    expect(team).toMatchObject({
      ministryId: ministry.id,
      churchId: CHURCH_ID,
    });
    expect(role).toMatchObject({
      ministryId: ministry.id,
      churchId: CHURCH_ID,
    });
  });

  it('qualifies a Volunteer only for the Roles granted and retires a profile with leftAt', async () => {
    await buildUser({
      db: testDb,
      id: VOLUNTEER_USER_ID,
      name: 'Vol',
      email: 'vol@builders.test',
    });
    await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    const ministry = await buildMinistry({
      db: testDb,
      churchId: CHURCH_ID,
      id: '33333333-3333-4333-8333-333333333331',
      name: 'Hospitality',
    });
    const usher = await buildRole({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      id: '33333333-3333-4333-8333-333333333351',
      name: 'Usher',
    });
    await buildRole({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      id: '33333333-3333-4333-8333-333333333352',
      name: 'Greeter',
    });
    const retired = await buildVolunteer({
      db: testDb,
      churchId: CHURCH_ID,
      userId: VOLUNTEER_USER_ID,
      id: '44444444-4444-4444-8444-444444444441',
      leftAt: parseInstant({ value: '2024-01-01T00:00:00Z' }),
    });
    const active = await buildVolunteer({
      db: testDb,
      churchId: CHURCH_ID,
      userId: VOLUNTEER_USER_ID,
      id: '44444444-4444-4444-8444-444444444442',
    });
    const membership = await buildMinistryMembership({
      db: testDb,
      churchId: CHURCH_ID,
      volunteerId: active.id,
      ministryId: ministry.id,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ministryAccessLevel: 'volunteer',
      roleIds: [usher.id],
      teams: [],
    });

    expect(retired.leftAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    const activeProfiles = await testDb
      .select()
      .from(volunteer)
      .where(
        and(eq(volunteer.userId, VOLUNTEER_USER_ID), isNull(volunteer.leftAt)),
      );
    expect(activeProfiles.map((row) => row.id)).toEqual([active.id]);

    const grants = await testDb
      .select()
      .from(ministryVolunteerRole)
      .where(eq(ministryVolunteerRole.ministryVolunteerId, membership.id));
    expect(grants.map((grant) => grant.roleId)).toEqual([usher.id]);
  });

  it('composes a scheduling graph from Planning Cycle to audited Assignment', async () => {
    await buildUser({
      db: testDb,
      id: ADMIN_USER_ID,
      name: 'Admin',
      email: 'admin@builders.test',
    });
    await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    const ministry = await buildMinistry({
      db: testDb,
      churchId: CHURCH_ID,
      id: '33333333-3333-4333-8333-333333333331',
      name: 'Hospitality',
    });
    const usher = await buildRole({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      id: '33333333-3333-4333-8333-333333333351',
      name: 'Usher',
    });
    const volunteerRow = await buildVolunteer({
      db: testDb,
      churchId: CHURCH_ID,
      userId: ADMIN_USER_ID,
      id: '44444444-4444-4444-8444-444444444441',
    });
    const start = parseInstant({ value: '2024-06-05T09:00:00Z' });
    const end = parseInstant({ value: '2024-06-05T11:00:00Z' });
    const cycle = await buildPlanningCycle({
      db: testDb,
      churchId: CHURCH_ID,
      name: 'June cycle',
      startDate: parseCalendarDay({ value: '2024-06-01' }),
      endDate: parseCalendarDay({ value: '2024-07-01' }),
      state: 'draft',
    });
    const planned = await buildEvent({
      db: testDb,
      churchId: CHURCH_ID,
      planningCycleId: cycle.id,
      title: 'Youth Gathering',
      start,
      end,
      status: 'draft',
    });
    const slot = await buildTimeSlot({
      db: testDb,
      churchId: CHURCH_ID,
      eventId: planned.id,
      start,
      end,
      label: 'Morning Service',
    });
    const participation = await buildMinistryParticipation({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      eventId: planned.id,
      state: 'tailoring',
      timeSlotIds: [slot.id],
    });
    const shiftRow = await buildShift({
      db: testDb,
      churchId: CHURCH_ID,
      participationId: participation.id,
      timeSlotId: slot.id,
      start,
      end,
    });
    await buildSlotRequirement({
      db: testDb,
      churchId: CHURCH_ID,
      participationId: participation.id,
      shiftId: shiftRow.id,
      roleId: usher.id,
      requiredCount: 2,
    });
    const assigned = await buildAssignment({
      db: testDb,
      churchId: CHURCH_ID,
      participationId: participation.id,
      shiftId: shiftRow.id,
      volunteerId: volunteerRow.id,
      roleId: usher.id,
      status: 'confirmed',
      assignedAt: parseInstant({ value: '2024-06-01T10:00:00Z' }),
      assignedBy: ADMIN_USER_ID,
    });
    await buildAssignmentAudit({
      db: testDb,
      churchId: CHURCH_ID,
      assignmentId: assigned.id,
      actorId: ADMIN_USER_ID,
      action: 'created',
      timestamp: parseInstant({ value: '2024-06-01T10:00:00Z' }),
    });

    const membership = await buildMinistryMembership({
      db: testDb,
      churchId: CHURCH_ID,
      volunteerId: volunteerRow.id,
      ministryId: ministry.id,
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      ministryAccessLevel: 'volunteer',
      roleIds: [],
      teams: [],
    });
    const check = await buildAvailabilityCheck({
      db: testDb,
      churchId: CHURCH_ID,
      planningCycleId: cycle.id,
      ministryVolunteerId: membership.id,
    });
    await buildAvailability({
      db: testDb,
      churchId: CHURCH_ID,
      availabilityCheckId: check.id,
      shiftId: shiftRow.id,
    });

    expect(check.state).toBe('pending');
    const marks = await testDb
      .select()
      .from(availability)
      .where(eq(availability.availabilityCheckId, check.id));
    expect(marks.map((mark) => mark.shiftId)).toEqual([shiftRow.id]);
    expect(cycle.startDate).toEqual(new Date('2024-06-01T00:00:00Z'));
    expect(planned.eventType).toBe('hourly');
    const [storedAssignment] = await testDb
      .select()
      .from(assignment)
      .where(eq(assignment.id, assigned.id));
    expect(storedAssignment).toMatchObject({
      status: 'confirmed',
      assignedBy: ADMIN_USER_ID,
      assignedAt: new Date('2024-06-01T10:00:00Z'),
    });
    const audits = await testDb
      .select()
      .from(assignmentAudit)
      .where(eq(assignmentAudit.assignmentId, assigned.id));
    expect(audits).toHaveLength(1);
    const inclusions = await testDb
      .select()
      .from(participationSlotInclusion)
      .where(eq(participationSlotInclusion.participationId, participation.id));
    expect(inclusions).toHaveLength(1);
  });

  it('builds a Time Slot, Shift and Assignment for a Volunteer in one step', async () => {
    await buildUser({
      db: testDb,
      id: ADMIN_USER_ID,
      name: 'Admin',
      email: 'admin@builders.test',
    });
    await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    const ministry = await buildMinistry({
      db: testDb,
      churchId: CHURCH_ID,
      name: 'Hospitality',
    });
    const usher = await buildRole({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      name: 'Usher',
    });
    const volunteerRow = await buildVolunteer({
      db: testDb,
      churchId: CHURCH_ID,
      userId: ADMIN_USER_ID,
    });
    const start = parseInstant({ value: '2024-06-05T09:00:00Z' });
    const end = parseInstant({ value: '2024-06-05T10:00:00Z' });
    const cycle = await buildPlanningCycle({
      db: testDb,
      churchId: CHURCH_ID,
      name: 'June cycle',
      startDate: parseCalendarDay({ value: '2024-06-01' }),
      endDate: parseCalendarDay({ value: '2024-07-01' }),
      state: 'draft',
    });
    const planned = await buildEvent({
      db: testDb,
      churchId: CHURCH_ID,
      planningCycleId: cycle.id,
      title: 'Sunday',
      start,
      end,
      status: 'scheduled',
    });
    const participation = await buildMinistryParticipation({
      db: testDb,
      churchId: CHURCH_ID,
      ministryId: ministry.id,
      eventId: planned.id,
      state: 'published',
      timeSlotIds: [],
    });

    const assigned = await buildAssignedShift({
      db: testDb,
      churchId: CHURCH_ID,
      eventId: planned.id,
      participationId: participation.id,
      volunteerId: volunteerRow.id,
      roleId: usher.id,
      start,
      end,
      status: 'confirmed',
    });

    expect(assigned.timeSlot.eventId).toBe(planned.id);
    expect(assigned.shift).toMatchObject({
      timeSlotId: assigned.timeSlot.id,
      participationId: participation.id,
    });
    expect(assigned.assignment).toMatchObject({
      shiftId: assigned.shift.id,
      volunteerId: volunteerRow.id,
      status: 'confirmed',
    });
  });

  it('builds an Event Template with ordered Time Blocks', async () => {
    await buildChurch({
      db: testDb,
      id: CHURCH_ID,
      name: 'Built Church',
      slug: 'built-church',
      timezone: 'UTC',
    });
    const built = await buildEventTemplate({
      db: testDb,
      churchId: CHURCH_ID,
      name: 'Sunday',
      weekday: 0,
      blocks: [
        { label: 'Early', startTime: '08:00', endTime: '09:00', order: 1 },
        { label: 'Late', startTime: '10:00', endTime: '11:00', order: 2 },
      ],
    });

    expect(built.template).toMatchObject({ name: 'Sunday', weekday: 0 });
    expect(built.blocks.map((block) => block.label)).toEqual(['Early', 'Late']);
  });
});

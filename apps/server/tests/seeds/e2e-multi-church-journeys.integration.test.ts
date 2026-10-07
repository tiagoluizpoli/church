import 'reflect-metadata';
import {
  assignment,
  member,
  ministryInvitation,
  ministryInvitationRole,
  ministryVolunteer,
  planningCycle,
  session,
  timeSlot,
  volunteer,
  volunteerTransfer,
} from '@church/db';
import {
  type CalendarDay,
  parseCalendarDay,
  parseTimeOfDay,
} from '@church/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  type ActiveChurchSwitchingJourney,
  createActiveChurchSwitchingRecipe,
} from '../../seeds/e2e/recipes/active-church-switching';
import { anchoredInstant } from '../../seeds/e2e/recipes/rostering-church';
import {
  createVolunteerTransferRecipe,
  type VolunteerTransferJourney,
} from '../../seeds/e2e/recipes/volunteer-transfer';
import {
  ChurchId,
  MinistryInvitationId,
  UserId,
} from '../../src/domain/branded-ids';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories';
import { DrizzleVolunteerTransferRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-transfer.repository';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { snapshotAllRows } from './journey-graph-snapshot';
import { qualifiedRoleIds } from './qualified-role-ids';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** Past the legacy seed's last fixed date (2026-12-28). */
const LATE_ANCHOR: CalendarDay = parseCalendarDay({ value: '2027-03-01' });

interface LoadInput {
  anchor: CalendarDay;
}

async function loadSwitching({
  anchor,
}: LoadInput): Promise<ActiveChurchSwitchingJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createActiveChurchSwitchingRecipe({ journeyKey: 'alpha', anchor }),
  });
}

async function loadTransfer({
  anchor,
}: LoadInput): Promise<VolunteerTransferJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createVolunteerTransferRecipe({ journeyKey: 'alpha', anchor }),
  });
}

interface UserIdInput {
  userId: string;
}

interface ChurchRoleRow {
  churchId: string;
  role: string;
}

async function churchRolesOf({
  userId,
}: UserIdInput): Promise<ChurchRoleRow[]> {
  const rows = await testDb
    .select({ churchId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));
  return rows.sort((left, right) =>
    left.churchId.localeCompare(right.churchId),
  );
}

interface VolunteerProfileRow {
  churchId: string;
  leftAt: Date | null;
}

async function profilesOf({
  userId,
}: UserIdInput): Promise<VolunteerProfileRow[]> {
  return await testDb
    .select({ churchId: volunteer.churchId, leftAt: volunteer.leftAt })
    .from(volunteer)
    .where(eq(volunteer.userId, userId));
}

describe('active-church-switching E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('makes one User Church A’s ChurchAdmin and Volunteer and a plain member of Church B', async () => {
    const journey = await loadSwitching({ anchor: ANCHOR });
    const { dualMember } = journey.churchA.personas;

    expect(await churchRolesOf({ userId: dualMember.userId })).toEqual(
      [
        { churchId: journey.churchA.church.id, role: 'admin' },
        { churchId: journey.churchB.church.id, role: 'member' },
      ].sort((left, right) => left.churchId.localeCompare(right.churchId)),
    );
    expect(journey.churchBMembership).toMatchObject({
      churchId: journey.churchB.church.id,
      userId: dualMember.userId,
      accessLevel: 'member',
    });
    // An active Volunteer in only one Church: no profile in Church B, so no
    // Ministry and no scheduling access there.
    expect(await profilesOf({ userId: dualMember.userId })).toEqual([
      { churchId: journey.churchA.church.id, leftAt: null },
    ]);
    expect(
      await qualifiedRoleIds({ volunteerId: dualMember.volunteerId }),
    ).toEqual([journey.churchA.ministries.worship.roles.usher.id]);
    expect(
      await testDb
        .select({ id: planningCycle.id })
        .from(planningCycle)
        .where(eq(planningCycle.churchId, journey.churchB.church.id)),
    ).toEqual([]);
  });

  it.each([
    ['an early anchor', ANCHOR],
    ['an anchor past the legacy seed dates', LATE_ANCHOR],
  ])('gives Church A two locked, back-to-back future cycles from %s', async (_label, anchor) => {
    const journey = await loadSwitching({ anchor });

    const cycles = await testDb
      .select({
        id: planningCycle.id,
        name: planningCycle.name,
        state: planningCycle.state,
        startDate: planningCycle.startDate,
        endDate: planningCycle.endDate,
      })
      .from(planningCycle)
      .where(eq(planningCycle.churchId, journey.churchA.church.id))
      .orderBy(planningCycle.startDate);
    expect(cycles.map(({ id, name }) => ({ id, name }))).toEqual([
      journey.cycles.first,
      journey.cycles.second,
    ]);
    expect(cycles.map(({ state }) => state)).toEqual(['locked', 'locked']);
    const [first, second] = cycles;
    const anchorDate = new Date(`${anchor}T00:00:00Z`);
    expect(first?.startDate.getTime()).toBeGreaterThan(anchorDate.getTime());
    expect(second?.startDate.getTime()).toBeGreaterThan(
      first?.endDate.getTime() ?? Number.POSITIVE_INFINITY,
    );
    expect(journey.cycles.first.name).not.toBe(journey.cycles.second.name);
  });
});

describe('volunteer-transfer E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('makes the transferee an active Volunteer of Church B only and a plain member of Church A', async () => {
    const journey = await loadTransfer({ anchor: ANCHOR });
    const { transferee } = journey.churchB.personas;

    expect(await churchRolesOf({ userId: transferee.userId })).toEqual(
      [
        { churchId: journey.churchA.church.id, role: 'member' },
        { churchId: journey.churchB.church.id, role: 'member' },
      ].sort((left, right) => left.churchId.localeCompare(right.churchId)),
    );
    expect(await profilesOf({ userId: transferee.userId })).toEqual([
      { churchId: journey.churchB.church.id, leftAt: null },
    ]);
    expect(
      await qualifiedRoleIds({ volunteerId: transferee.volunteerId }),
    ).toEqual([journey.churchB.ministries.hospitality.roles.porter.id]);
    // Church A's Ministry has only its leader: the journey's Ministry
    // Invitation is what brings the transferee in.
    expect(
      await testDb
        .select({ volunteerId: ministryVolunteer.volunteerId })
        .from(ministryVolunteer)
        .where(
          eq(
            ministryVolunteer.ministryId,
            journey.churchA.ministries.worship.id,
          ),
        ),
    ).toEqual([{ volunteerId: journey.churchA.personas.admin.volunteerId }]);
  });

  it.each([
    ['an early anchor', ANCHOR],
    ['an anchor past the legacy seed dates', LATE_ANCHOR],
  ])('holds the transferee’s active Assignment on a future Church B seat from %s', async (_label, anchor) => {
    const journey = await loadTransfer({ anchor });
    const { seat } = journey;

    const [row] = await testDb
      .select({
        volunteerId: assignment.volunteerId,
        roleId: assignment.roleId,
        status: assignment.status,
        shiftId: assignment.shiftId,
        startsAt: timeSlot.startTime,
      })
      .from(assignment)
      .innerJoin(timeSlot, eq(timeSlot.id, seat.event.timeSlotId))
      .where(eq(assignment.id, seat.assignmentId));
    expect(row).toMatchObject({
      volunteerId: journey.churchB.personas.transferee.volunteerId,
      roleId: journey.churchB.ministries.hospitality.roles.porter.id,
      status: 'draft',
      shiftId: seat.event.shiftId,
    });
    const anchorMidnight = anchoredInstant({
      anchor,
      dayOffset: 0,
      time: parseTimeOfDay({ value: '00:00' }),
    });
    expect(row?.startsAt.getTime()).toBeGreaterThan(
      new Date(anchorMidnight).getTime(),
    );
    expect(seat.event.requirements.porter.requiredCount).toBe(1);
  });

  it('recreates its starting graph over one the transfer already ran on', async () => {
    const journey = await loadTransfer({ anchor: ANCHOR });
    const fresh = await snapshotAllRows();
    const { transferee } = journey.churchB.personas;

    // What the journey does through the product: Church A mints a Ministry
    // Invitation and the transferee confirms the transfer.
    const [invitation] = await testDb
      .insert(ministryInvitation)
      .values({
        churchId: journey.churchA.church.id,
        ministryId: journey.churchA.ministries.worship.id,
        inviteeUserId: transferee.userId,
        ministryAccessLevel: 'volunteer',
        inviterId: journey.churchA.personas.admin.userId,
        expiresAt: new Date('2026-04-15T00:00:00Z'),
      })
      .returning({ id: ministryInvitation.id });
    if (!invitation)
      throw new Error('The Ministry Invitation was not inserted');
    const invitationId = invitation.id;
    await testDb.insert(ministryInvitationRole).values({
      churchId: journey.churchA.church.id,
      ministryInvitationId: invitationId,
      roleId: journey.churchA.ministries.worship.roles.usher.id,
    });
    const outcome = await new DrizzleUnitOfWork({ db: testDb }).run((tx) =>
      new DrizzleVolunteerTransferRepository({ db: testDb }).executeTransfer({
        userId: UserId.from(transferee.userId),
        ministryInvitationId: MinistryInvitationId.from(invitationId),
        sourceChurchId: ChurchId.from(journey.churchB.church.id),
        destinationChurchId: ChurchId.from(journey.churchA.church.id),
        confirmedAt: new Date('2026-03-16T12:00:00Z'),
        correlationId: 'e2e-transfer-retry',
        tx,
      }),
    );
    expect(outcome.kind).toBe('transferred');
    expect(await testDb.select().from(volunteerTransfer)).toHaveLength(1);

    const reloaded = await loadTransfer({ anchor: ANCHOR });

    expect(reloaded).toEqual(journey);
    expect(await snapshotAllRows()).toEqual(fresh);
  });

  it('recreates the switching graph over one the church switch already ran on', async () => {
    const journey = await loadSwitching({ anchor: ANCHOR });
    const fresh = await snapshotAllRows();
    const { userId } = journey.churchA.personas.dualMember;

    // What selecting and switching Churches writes: a session whose active
    // organization is Church B, and the Church Membership's last-opened stamp.
    await testDb.insert(session).values({
      id: 'e2e-switching-session',
      token: 'e2e-switching-session-token',
      expiresAt: new Date('2099-01-01T00:00:00Z'),
      userId,
      activeOrganizationId: journey.churchB.church.id,
    });
    await testDb
      .update(member)
      .set({ lastOpenedAt: new Date('2026-03-16T12:00:00Z') })
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, journey.churchB.church.id),
        ),
      );

    const reloaded = await loadSwitching({ anchor: ANCHOR });

    expect(reloaded).toEqual(journey);
    expect(await snapshotAllRows()).toEqual(fresh);
  });
});

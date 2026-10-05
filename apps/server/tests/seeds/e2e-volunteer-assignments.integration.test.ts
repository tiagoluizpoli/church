import {
  assignment,
  church,
  event,
  invitation,
  member,
  organization,
  user,
  volunteerNotification,
} from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  createVolunteerAssignmentsRecipe,
  type VolunteerAssignmentsJourney,
} from '../../seeds/e2e/recipes/volunteer-assignments';
import { ensurePlatformOperator } from '../../src/scripts/ensure-platform-operator';
import { testDb, truncateAll } from '../integration/repositories/setup';
import { snapshotAllRows } from './journey-graph-snapshot';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** America/Sao_Paulo is UTC-3 all year (no DST), so 09:00 and 11:00 local. */
const EVENT_STARTS_AT = '2026-03-22T12:00:00.000Z';
const EVENT_ENDS_AT = '2026-03-22T14:00:00.000Z';

interface JourneyKeyInput {
  journeyKey: string;
}

async function loadJourney({
  journeyKey,
}: JourneyKeyInput): Promise<VolunteerAssignmentsJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createVolunteerAssignmentsRecipe({ journeyKey, anchor: ANCHOR }),
  });
}

interface AssignmentStatusInput {
  assignmentId: string;
}

async function assignmentStatus({
  assignmentId,
}: AssignmentStatusInput): Promise<string | undefined> {
  const [row] = await testDb
    .select({ status: assignment.status })
    .from(assignment)
    .where(eq(assignment.id, assignmentId));
  return row?.status;
}

interface DeclineWithNotificationInput {
  journey: VolunteerAssignmentsJourney;
}

/** What the journey does to its graph: decline, and a notification results. */
async function mutateLikeTheJourney({
  journey,
}: DeclineWithNotificationInput): Promise<void> {
  await testDb
    .update(assignment)
    .set({ status: 'declined' })
    .where(eq(assignment.id, journey.assignment.id));
  await testDb.insert(volunteerNotification).values({
    churchId: journey.church.id,
    volunteerId: journey.volunteer.volunteerId,
    eventId: journey.assignment.eventId,
    assignmentId: journey.assignment.id,
    type: 'assignment_changed',
    title: 'Changed',
    body: 'Changed',
    payload: {},
  });
}

describe('volunteer-assignments E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('provisions the Church through Church Provisioning in the Church Timezone', async () => {
    const journey = await loadJourney({ journeyKey: 'alpha' });

    const [churchRow] = await testDb
      .select({ slug: organization.slug, timezone: church.timezone })
      .from(organization)
      .innerJoin(church, eq(church.id, organization.id))
      .where(eq(organization.id, journey.church.id));
    expect(churchRow).toEqual({
      slug: journey.church.slug,
      timezone: 'America/Sao_Paulo',
    });
    expect(journey.church.slug).toMatch(/^e2e-[0-9a-f]{12}$/);

    const invitations = await testDb
      .select({ role: invitation.role, status: invitation.status })
      .from(invitation)
      .where(eq(invitation.organizationId, journey.church.id));
    expect(invitations).toEqual([{ role: 'admin', status: 'pending' }]);
  });

  it('gives the Volunteer an authenticatable account and one member Church Membership', async () => {
    const journey = await loadJourney({ journeyKey: 'alpha' });

    const credential = await testDb.query.account.findFirst({
      where: (account, { and: all, eq: equal }) =>
        all(
          equal(account.userId, journey.volunteer.userId),
          equal(account.providerId, 'credential'),
        ),
    });
    expect(
      await verifyPassword({
        hash: credential?.password ?? '',
        password: journey.volunteer.password,
      }),
    ).toBe(true);

    const [userRow] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, journey.volunteer.userId));
    expect(userRow).toMatchObject({
      email: journey.volunteer.email,
      emailVerified: true,
    });

    const memberships = await testDb
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.organizationId, journey.church.id),
          eq(member.userId, journey.volunteer.userId),
        ),
      );
    expect(memberships).toEqual([{ role: 'member' }]);
  });

  it('seeds a published, confirmed assignment at 09:00-11:00 Church-local, 7 days after the anchor', async () => {
    const journey = await loadJourney({ journeyKey: 'alpha' });

    expect(journey.anchor).toBe(ANCHOR);
    expect(journey.assignment.startsAt).toBe(EVENT_STARTS_AT);
    expect(journey.assignment.endsAt).toBe(EVENT_ENDS_AT);

    const rows = await testDb.query.assignment.findFirst({
      where: eq(assignment.id, journey.assignment.id),
    });
    expect(rows).toMatchObject({
      churchId: journey.church.id,
      volunteerId: journey.volunteer.volunteerId,
      status: 'confirmed',
    });

    const [eventRow] = await testDb
      .select()
      .from(event)
      .where(eq(event.id, journey.assignment.eventId));
    expect(eventRow).toMatchObject({
      title: journey.assignment.eventTitle,
      status: 'scheduled',
      eventType: 'hourly',
    });
    expect(eventRow?.start.toISOString()).toBe(EVENT_STARTS_AT);
    expect(eventRow?.end.toISOString()).toBe(EVENT_ENDS_AT);

    const participation = await testDb.query.ministryParticipation.findFirst({
      where: (row, { eq: equal }) => equal(row.eventId, eventRow?.id ?? ''),
    });
    expect(participation?.state).toBe('published');
    expect(rows?.participationId).toBe(participation?.id);
    expect(journey.assignment.ministryName).toBe('Recepção');
    expect(journey.assignment.roleName).toBe('Recepcionista');
  });

  it('restores the starting state when a mutated graph is reloaded', async () => {
    const journey = await loadJourney({ journeyKey: 'alpha' });
    await ensurePlatformOperator({ db: testDb });
    const startingState = await snapshotAllRows();

    await mutateLikeTheJourney({ journey });
    expect(
      await assignmentStatus({ assignmentId: journey.assignment.id }),
    ).toBe('declined');

    const reloaded = await loadJourney({ journeyKey: 'alpha' });

    expect(reloaded).toEqual(journey);
    expect(await snapshotAllRows()).toEqual(startingState);
  });

  it('names the graph from a Playwright test id without embedding it', async () => {
    const journey = await loadJourney({
      journeyKey: 'a5f3c1d2e9b7a6c5d4e3-0f1a2b3c4d5e6f7a8b9c-0',
    });

    expect(journey.church.slug).toMatch(/^e2e-[0-9a-f]{12}$/);
    expect(journey.volunteer.email).toMatch(
      /^volunteer@[0-9a-f]{12}\.e2e\.test$/,
    );
  });

  it('refuses an empty journey key', () => {
    expect(() =>
      createVolunteerAssignmentsRecipe({ journeyKey: '', anchor: ANCHOR }),
    ).toThrow('non-empty journey key');
  });
});

import {
  assignment,
  event,
  ministryParticipation,
  planningCycle,
  shift,
  volunteerNotification,
} from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  parseCalendarDay,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '../../seeds/e2e/journey-recipe';
import {
  createVolunteerDashboardRecipe,
  type VolunteerDashboardJourney,
} from '../../seeds/e2e/recipes/volunteer-dashboard';
import { testDb, truncateAll } from '../integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });
/** Past the legacy seed's last fixed date (2026-12-28). */
const LATE_ANCHOR: CalendarDay = parseCalendarDay({ value: '2027-03-01' });

interface LoadInput {
  anchor: CalendarDay;
}

async function load({ anchor }: LoadInput): Promise<VolunteerDashboardJourney> {
  return await runE2eJourneyRecipe({
    db: testDb,
    recipe: createVolunteerDashboardRecipe({ journeyKey: 'alpha', anchor }),
  });
}

interface DayOfInput {
  value: Date;
}

/** The Church-local (UTC-3, no DST) calendar day of a stored instant. */
function churchDayOf({ value }: DayOfInput): string {
  return new Date(value.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

describe('volunteer-dashboard E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('gives the Volunteer a confirmed Care assignment, an unanswered event and one unread removal notice', async () => {
    const journey = await load({ anchor: ANCHOR });
    const volunteerId = journey.personas.volunteer.volunteerId;

    const assignments = await testDb
      .select({
        id: assignment.id,
        status: assignment.status,
        volunteerId: assignment.volunteerId,
      })
      .from(assignment)
      .where(eq(assignment.churchId, journey.church.id));
    expect(assignments).toEqual([
      { id: expect.any(String), status: 'confirmed', volunteerId },
    ]);

    const participations = await testDb
      .select({ state: ministryParticipation.state })
      .from(ministryParticipation)
      .where(eq(ministryParticipation.churchId, journey.church.id));
    expect(participations).toEqual([
      { state: 'published' },
      { state: 'published' },
      { state: 'published' },
    ]);

    const notifications = await testDb
      .select()
      .from(volunteerNotification)
      .where(eq(volunteerNotification.churchId, journey.church.id));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      volunteerId,
      title: journey.notification.title,
      type: 'assignment_removed',
      readAt: null,
      eventId: journey.removedEvent.id,
      assignmentId: null,
      payload: {
        eventId: journey.removedEvent.id,
        assignmentId: expect.any(String),
        section: 'assignments',
      },
    });
    expect(notifications[0]?.body).toContain(journey.removedEvent.title);
  });

  it('leaves the removal on its own past event: no Assignment row, so neither the confirmed Care one nor any upcoming one is touched', async () => {
    const journey = await load({ anchor: ANCHOR });

    const shiftAssignments = await testDb
      .select({ id: assignment.id, shiftId: assignment.shiftId })
      .from(assignment)
      .where(eq(assignment.churchId, journey.church.id));
    expect(shiftAssignments).toEqual([
      { id: expect.any(String), shiftId: journey.careEvent.shiftId },
    ]);
    expect(journey.removedEvent.shiftId).not.toBe(journey.careEvent.shiftId);
    expect(journey.removedEvent.startsAt < journey.careEvent.startsAt).toBe(
      true,
    );
    expect(journey.removedEvent.day).toBe(
      addCalendarDays({ day: ANCHOR, days: -1 }),
    );
  });

  it('puts the Care event before the availability event, both after the anchor', async () => {
    const journey = await load({ anchor: ANCHOR });

    expect(journey.careEvent.startsAt).toBe('2026-03-18T12:00:00.000Z');
    expect(journey.availabilityEvent.startsAt).toBe('2026-03-22T12:00:00.000Z');
    expect(journey.notification.createdAt).toBe('2026-03-14T11:00:00.000Z');
  });

  it('follows the anchor past the legacy seed dates: events, shifts, cycle and notification', async () => {
    const journey = await load({ anchor: LATE_ANCHOR });
    const anchorTime = new Date(`${LATE_ANCHOR}T00:00:00Z`).getTime();

    const events = await testDb
      .select({ start: event.start, end: event.end })
      .from(event)
      .where(eq(event.churchId, journey.church.id));
    const shifts = await testDb
      .select({ start: shift.startTime, end: shift.endTime })
      .from(shift)
      .where(eq(shift.churchId, journey.church.id));
    const [notification] = await testDb
      .select({ createdAt: volunteerNotification.createdAt })
      .from(volunteerNotification)
      .where(eq(volunteerNotification.churchId, journey.church.id));
    const [cycle] = await testDb
      .select({ startDate: planningCycle.startDate })
      .from(planningCycle)
      .where(eq(planningCycle.churchId, journey.church.id));

    expect(events).toHaveLength(3);
    expect(shifts).toHaveLength(3);
    const upcoming = [...events, ...shifts].filter(
      ({ start }) => start.getTime() > anchorTime,
    );
    // Everything but the removed event's two rows lies after the anchor.
    expect(upcoming).toHaveLength(4);
    for (const { start, end } of [...events, ...shifts]) {
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    }
    expect(
      [...events, ...shifts].map(({ start }) => churchDayOf({ value: start })),
    ).toEqual(
      expect.arrayContaining([
        addCalendarDays({ day: LATE_ANCHOR, days: 3 }),
        addCalendarDays({ day: LATE_ANCHOR, days: 7 }),
        addCalendarDays({ day: LATE_ANCHOR, days: -1 }),
      ]),
    );
    expect(churchDayOf({ value: notification?.createdAt ?? new Date(0) })).toBe(
      addCalendarDays({ day: LATE_ANCHOR, days: -1 }),
    );
    expect(cycle?.startDate.toISOString().slice(0, 10)).toBe(LATE_ANCHOR);
  });

  it('restores the notification and assignment when a mutated graph is reloaded', async () => {
    const journey = await load({ anchor: ANCHOR });
    await testDb
      .update(volunteerNotification)
      .set({ readAt: new Date() })
      .where(eq(volunteerNotification.id, journey.notification.id));
    await testDb
      .update(assignment)
      .set({ status: 'declined' })
      .where(eq(assignment.churchId, journey.church.id));

    const reloaded = await load({ anchor: ANCHOR });

    expect(reloaded).toEqual(journey);
    const [row] = await testDb
      .select({ readAt: volunteerNotification.readAt })
      .from(volunteerNotification)
      .where(eq(volunteerNotification.id, journey.notification.id));
    expect(row?.readAt).toBeNull();
  });
});

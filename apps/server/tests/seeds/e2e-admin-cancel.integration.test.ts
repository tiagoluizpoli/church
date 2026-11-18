import { assignment, ministryParticipation, swapRequest } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import { createAdminCancelRecipe } from '@/seeds/e2e/recipes/admin-cancel';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

describe('admin-cancel E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('starts from a published, confirmed Assignment with an open SwapRequest, a distinct ChurchAdmin and leader', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createAdminCancelRecipe({ journeyKey: 'alpha', anchor: ANCHOR }),
    });

    const [participation] = await testDb
      .select({ state: ministryParticipation.state })
      .from(ministryParticipation)
      .where(eq(ministryParticipation.churchId, journey.church.id));
    expect(participation?.state).toBe('published');

    const rows = await testDb
      .select()
      .from(assignment)
      .where(eq(assignment.churchId, journey.church.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: journey.assignmentId,
      volunteerId: journey.personas.volunteer.volunteerId,
      status: 'confirmed',
    });
    const [open] = await testDb
      .select()
      .from(swapRequest)
      .where(eq(swapRequest.churchId, journey.church.id));
    expect(open).toMatchObject({
      assignmentId: journey.assignmentId,
      status: 'open',
    });
    expect(
      new Set([
        journey.personas.admin.userId,
        journey.personas.leader.userId,
        journey.personas.volunteer.userId,
      ]).size,
    ).toBe(3);
  });
});

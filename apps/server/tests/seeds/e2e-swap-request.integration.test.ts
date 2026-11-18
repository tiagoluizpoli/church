import { assignment, ministryParticipation } from '@church/db';
import { type CalendarDay, parseCalendarDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { runE2eJourneyRecipe } from '@/seeds/e2e/journey-recipe';
import { createSwapRequestRecipe } from '@/seeds/e2e/recipes/swap-request';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const ANCHOR: CalendarDay = parseCalendarDay({ value: '2026-03-15' });

describe('swap-request E2E journey recipe', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('starts from a published, confirmed Assignment with a qualified replacement', async () => {
    const journey = await runE2eJourneyRecipe({
      db: testDb,
      recipe: createSwapRequestRecipe({ journeyKey: 'alpha', anchor: ANCHOR }),
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
    expect(journey.personas.replacement.volunteerId).not.toBe(
      journey.personas.volunteer.volunteerId,
    );
  });
});

import AxeBuilder from '@axe-core/playwright';
import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { loadPublicChurchProfileJourney } from '@/tests/fixtures/journeys/public-church-profile';

// #1045 / #1001: the Public Church Profile end to end, signed out. The
// Programme, a moved and a cancelled Public Event, the old-slug redirect and
// the absence of a private contact are read through the real server.
const PT = { locale: 'pt-BR' } as const;

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public Church Profile', () => {
  test('a signed-out visitor sees the Programme and Public Events, never a private contact; an old slug redirects', async ({
    page,
  }, testInfo) => {
    const journey = loadPublicChurchProfileJourney({ testInfo });

    await page.goto(`/${journey.church.slug}`);
    await expect(
      page.getByRole('heading', { level: 1, name: journey.church.name }),
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: m.public_programme_title({}, PT) }),
    ).toBeVisible();
    await expect(
      page.getByText(`Todo domingo · 19:00 · ${journey.programmeLabel}`),
    ).toBeVisible();

    const events = page.locator('#public-events-title').locator('..');
    await expect(events).toContainText(journey.movedEvent.title);
    // The event item wraps its block item; the outer one comes first.
    const moved = events
      .getByRole('listitem')
      .filter({ hasText: journey.movedEvent.title })
      .first();
    // One move: the as-sent time struck through, then the current one.
    await expect(moved.locator('s')).toHaveCount(1);
    await expect(moved).toContainText('→');

    const cancelled = events
      .getByRole('listitem')
      .filter({ hasText: journey.cancelledEvent.title })
      .first();
    await expect(
      cancelled.getByText(m.public_events_cancelled({}, PT)).first(),
    ).toBeVisible();

    await expect(page.getByText(journey.publicContact)).toBeVisible();
    await expect(page.getByText(journey.privateContact)).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(
      results.violations,
      `a11y violations: ${results.violations.map((v) => v.id).join(', ')}`,
    ).toEqual([]);

    await page.goto(`/${journey.oldSlug}`);
    await expect(page).toHaveURL(new RegExp(`/${journey.church.slug}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: journey.church.name }),
    ).toBeVisible();
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadCycleAccessJourney } from '@/tests/fixtures/journeys/planning-admin';

// P9/T067 — a11y coverage for the breadcrumb component introduced in T061,
// following the same pattern as a11y-builder.spec.ts's axe smoke test plus
// an explicit aria-current/landmark check (this repo's established a11y bar
// per T045's role-badge fix).
test('cycle breadcrumb has no critical or serious WCAG violations', async ({
  page,
}, testInfo) => {
  const journey = loadCycleAccessJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  await page.goto(`/cycles/${journey.cycle.id}`);
  await expect(page.getByTestId('breadcrumbs')).toBeVisible();
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page })
    .include('[data-testid="breadcrumbs"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(
    results.violations,
    `a11y violations: ${results.violations.map((v) => v.id).join(', ')}`,
  ).toEqual([]);
});

test('breadcrumb marks the exact-match page as current, not every ancestor link', async ({
  page,
}, testInfo) => {
  const journey = loadCycleAccessJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  // On /cycles exactly, that crumb *is* the current
  // page (BreadcrumbPage swap, isLast: true).
  await page.goto('/cycles');
  const nav = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Cycles');
});

test('breadcrumb never marks an ancestor link as the current page (regression: TanStack Router prefix-match aria-current)', async ({
  page,
}, testInfo) => {
  const journey = loadCycleAccessJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  // On /cycles/:cycleId, the real current "page" is the
  // opaque cycle id, which is intentionally hidden from the breadcrumb
  // (T061). Before the fix, TanStack Router's own prefix-match Link
  // behavior falsely marked *both* ancestor links ("Scheduling",
  // "Cycles") as aria-current="page" — never zero, never the
  // single correct one. `activeOptions={{ exact: true }}` closes that gap:
  // an ancestor breadcrumb link should never claim to be the current page.
  await page.goto(`/cycles/${journey.cycle.id}`);
  const nav = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);

  const links = nav.getByRole('link');
  await expect(links.first()).toBeVisible();
});

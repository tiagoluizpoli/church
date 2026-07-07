import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

// P9/T067 — a11y coverage for the breadcrumb component introduced in T061,
// following the same pattern as a11y-builder.spec.ts's axe smoke test plus
// an explicit aria-current/landmark check (this repo's established a11y bar
// per T045's role-badge fix).
test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

// Fixed E2E seed identifier (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS.planningCycle) — same convention as cross-cutting.spec.ts.
const CHURCH_A_CYCLE_ID = 'e2e21111-1111-1111-1111-111111111111';

test('planning-cycle breadcrumb has no critical or serious WCAG violations', async ({
  page,
}) => {
  await page.goto(`/scheduling/planning-cycles/${CHURCH_A_CYCLE_ID}`);
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
}) => {
  // On /scheduling/planning-cycles exactly, that crumb *is* the current
  // page (BreadcrumbPage swap, isLast: true).
  await page.goto('/scheduling/planning-cycles');
  const nav = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText(
    'Planning cycles',
  );
});

test('breadcrumb never marks an ancestor link as the current page (regression: TanStack Router prefix-match aria-current)', async ({
  page,
}) => {
  // On /scheduling/planning-cycles/:cycleId, the real current "page" is the
  // opaque cycle id, which is intentionally hidden from the breadcrumb
  // (T061). Before the fix, TanStack Router's own prefix-match Link
  // behavior falsely marked *both* ancestor links ("Scheduling",
  // "Planning cycles") as aria-current="page" — never zero, never the
  // single correct one. `activeOptions={{ exact: true }}` closes that gap:
  // an ancestor breadcrumb link should never claim to be the current page.
  await page.goto(`/scheduling/planning-cycles/${CHURCH_A_CYCLE_ID}`);
  const nav = page.getByRole('navigation', { name: 'breadcrumb' });
  await expect(nav).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);

  const links = nav.getByRole('link');
  await expect(links.first()).toBeVisible();
});

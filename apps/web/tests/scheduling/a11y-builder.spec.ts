import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T124 — Accessibility smoke. Global setup seeds an event for the leader and
// writes the leader session; we open the populated builder and run axe.
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111';

test('schedule builder has no critical or serious WCAG violations', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('cycle-builder-board')).toBeVisible({
    timeout: 15_000,
  });

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(
    blocking,
    `a11y violations: ${blocking.map((v) => v.id).join(', ')}`,
  ).toEqual([]);
});

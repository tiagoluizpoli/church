import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

// T124 — Accessibility smoke. Global setup seeds an event for the leader and
// writes the leader session; we open the populated builder and run axe.
test.use({ storageState: LEADER_STORAGE_STATE });

const BUILDER_URL =
  '/scheduling/events/e2e66666-6666-6666-6666-666666666661/builder';

test('schedule builder has no critical or serious WCAG violations', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
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

// FR-013: the ministry's Leader and Sub-leader are two distinct volunteers
// who both truncate near-identically ("E2E L." / "E2E S." are close, and the
// underlying draggable's accessible name used to be *only* that truncated
// text). Each draggable pool card must expose an accessible name that
// includes the role, so a screen reader never announces two different
// people identically (the confirmed /impeccable a11y bug).
test('Leader and Sub-leader volunteers are not screen-reader-identical', async ({
  page,
}) => {
  await page.goto(BUILDER_URL);
  await expect(page.getByTestId('builder-grid')).toBeVisible({
    timeout: 15_000,
  });

  const pool = page.getByTestId('volunteer-pool');
  const leaderCard = pool
    .getByTestId('volunteer-card')
    .filter({ hasText: /^E2E L\.$/ });
  const subLeaderCard = pool
    .getByTestId('volunteer-card')
    .filter({ hasText: /^E2E S\.$/ });

  await expect(leaderCard).toHaveAccessibleName('E2E Leader, Leader');
  await expect(subLeaderCard).toHaveAccessibleName(
    'E2E Sub-Leader, Sub-leader',
  );
});

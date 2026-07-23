import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

/**
 * 023 phase 3 — slot-aware rail.
 *
 * A leader must be able to point the rail at one shift×role straight from the
 * board, without opening the assignment popover first, and the rail must
 * *promote* that shift's candidates rather than hiding everyone else: an
 * unranked volunteer is still assignable, that is the override path.
 */

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111';

test.describe('slot focus drives the volunteer rail', () => {
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('focusing a role ranks the rail for it and clearing restores the plain pool', async ({
    page,
  }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const rail = page.getByTestId('volunteer-pool');
    await expect(rail).toBeVisible();
    const poolSize = await rail.getByTestId('volunteer-card').count();
    expect(poolSize).toBeGreaterThan(0);

    const focusRole = page
      .locator('[data-testid^="cycle-requirement-focus-"]')
      .first();
    await focusRole.click();

    // The popover is the flow this affordance exists to avoid.
    await expect(page.getByTestId('assignment-picker')).toHaveCount(0);
    await expect(focusRole).toHaveAttribute('aria-pressed', 'true');
    await expect(
      rail.getByRole('heading', { name: /Best for this role/ }),
    ).toBeVisible();
    // Nobody was filtered out — every card the pool had is still reachable.
    await expect(rail.getByTestId('volunteer-card')).toHaveCount(poolSize);

    await rail.getByRole('button', { name: 'All volunteers' }).click();

    await expect(
      rail.getByRole('heading', { name: /Best for this role/ }),
    ).toHaveCount(0);
    await expect(focusRole).toHaveAttribute('aria-pressed', 'false');
  });

  test('the focus control toggles its own cell off again', async ({ page }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const focusRole = page
      .locator('[data-testid^="cycle-requirement-focus-"]')
      .first();
    await focusRole.click();
    await expect(focusRole).toHaveAttribute('aria-pressed', 'true');

    await focusRole.click();
    await expect(focusRole).toHaveAttribute('aria-pressed', 'false');
    await expect(
      page
        .getByTestId('volunteer-pool')
        .getByRole('heading', { name: /Best for this role/ }),
    ).toHaveCount(0);
  });
});

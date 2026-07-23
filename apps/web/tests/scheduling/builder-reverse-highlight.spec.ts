import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

/**
 * 023 phase 4 — reverse highlight.
 *
 * Selecting someone in the rail must paint the board with where they actually
 * fit. The seed qualifies every candidate for their ministry's roles, so what
 * this spec can prove end-to-end is the plumbing: the selection reaches the
 * cells and resolves to a real tier, and clearing it puts the board back.
 * The `override` and `none` tiers are covered by the unit and component tests,
 * where an unqualified or unavailable candidate can actually be constructed —
 * the server never sends one to the rail.
 */

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-3333-333333333331/e2e21111-1111-1111-1111-111111111111';

test.describe('selecting a volunteer highlights where they fit', () => {
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('a selected volunteer lights the cells they fit and clearing puts them out', async ({
    page,
  }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const fitting = page.locator('[data-selected-fit="ready"]');
    await expect(fitting).toHaveCount(0);

    // The control relabels to "Selected", so it has to be found through its
    // card rather than by the unselected name.
    const selectSlot = page
      .getByTestId('volunteer-pool')
      .getByTestId('volunteer-card')
      .first()
      .getByRole('button', { name: /^(Select slot|Selected)$/ });
    await selectSlot.click();

    await expect(fitting.first()).toBeVisible();
    await expect(selectSlot).toHaveAttribute('aria-pressed', 'true');

    await selectSlot.click();

    await expect(fitting).toHaveCount(0);
  });
});

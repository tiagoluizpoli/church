import { expect, test } from '@playwright/test';
import { LEADER_STORAGE_STATE } from '../global-setup';

/**
 * 023 phase 3 — slot-aware rail.
 *
 * A leader must be able to point the rail at one shift×role straight from the
 * board, without opening the assignment popover first, and the rail must
 * *promote* that shift's eligible candidates rather than hiding everyone else.
 * Qualification, like availability, is an override path rather than a hard
 * filter (B-2) — the seed used here qualifies every candidate for their
 * ministry's roles, so an unqualified pick is not exercised by this spec.
 *
 * #217 — right-sized: the rail-ranking and focus-toggle assertions this file
 * used to carry are pure client-side state with no boundary crossing, and
 * already have direct component proof (cycle-builder.component.test.tsx's
 * "does not turn rail picks into writes...", volunteer-pool-sidebar.
 * component.test.tsx's "promotes a focused requirement's candidates...", and
 * cycle-builder-cell.component.test.tsx's focus-pressed assertions). What
 * remains here is the one assertion that still needs a real browser and
 * server round trip: committing a focused pick as an actual assignment,
 * including the collision/override dialogs a real conflict can trigger.
 */

const BUILDER_URL =
  '/scheduling/rostering/e2e33333-3333-3333-a333-333333333331/e2e21111-1111-1111-a111-111111111111';

test.describe('slot focus drives the volunteer rail', () => {
  test.use({ storageState: LEADER_STORAGE_STATE });

  test('assigns a focused candidate straight from their card, no popover', async ({
    page,
  }) => {
    await page.goto(BUILDER_URL);
    await expect(page.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });

    const rail = page.getByTestId('volunteer-pool');
    const focusRole = page
      .locator('[data-testid^="cycle-requirement-focus-"]')
      .first();
    const focusCell = page
      .locator('[data-testid^="cycle-requirement-"]')
      .filter({ has: focusRole })
      .first();
    // The cell's own "assigned/required" label — matched by shape so an added
    // chip cannot steal the locator the way `span:last` would.
    const fillLabel = focusCell.getByText(/^\d+\/\d+$/);
    const fillBefore = (await fillLabel.textContent()) ?? '';

    await focusRole.click();
    const pickMe = rail.getByTestId('volunteer-pick-me').first();
    await expect(pickMe).toBeVisible();
    await pickMe.click();

    // The picker is never involved, and focus clears so the cards revert.
    await expect(page.getByTestId('assignment-picker')).toHaveCount(0);
    await expect(rail.getByTestId('volunteer-pick-me')).toHaveCount(0);

    const collisionPrompt = page.getByRole('heading', {
      name: 'Volunteer already assigned',
    });
    if (await collisionPrompt.isVisible().catch(() => false)) {
      await page
        .getByRole('button', { name: /Move here|Swap assignments/ })
        .click();
    }

    const overridePrompt = page.getByRole('heading', {
      name: /Override conflict|Assign anyway/,
    });
    if (await overridePrompt.isVisible().catch(() => false)) {
      await page
        .getByPlaceholder(/Reason for override/)
        .fill('Leader approved this assignment');
      await page
        .getByRole('button', { name: /Confirm Override|Assign anyway/ })
        .click();
    }

    // The test only passes once the assignment is actually reflected in the
    // focused cell; opening a dialog alone is not a successful assignment.
    await expect(fillLabel).not.toHaveText(fillBefore, { timeout: 6_000 });
  });
});

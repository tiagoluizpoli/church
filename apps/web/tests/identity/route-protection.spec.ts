import { expect, test } from '@playwright/test';
import { signIn } from '../fixtures/journeys/identity-actions';
import {
  readSharedPersonas,
  VOLUNTEER_STORAGE_STATE,
} from '../fixtures/shared-personas';

// #66 — proves the route guards consolidated by #53 behave in a real
// browser: an unauthenticated deep link to a scheduling page sends the
// visitor to sign-in and returns them to that exact page afterwards, the
// landing route redirects to the dashboard, and an authenticated visitor to
// sign-in is sent onward. Open-redirect rejection of external/protocol-
// relative/backslash/encoded/script-scheme targets is a pure function
// (`validateInternalReturnTarget`, its own unit test) and is not repeated
// here.
//
// No journey graph and no scheduling rows are written. The deep-link test
// signs in as the suite's shared, read-only ChurchAdmin (global setup's
// `shared-personas` recipe) and asserts only the page shell, never
// scheduling rows.
const DEEP_LINK_PATH = '/scheduling/planning-cycles';

test.describe('#66 — route protection and deep-link return', () => {
  test.describe('signed out', () => {
    test('an unauthenticated deep link to a scheduling page returns to that exact page after sign-in', async ({
      page,
    }) => {
      const { churchAdmin } = readSharedPersonas().personas;

      await page.goto(DEEP_LINK_PATH);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?redirect=${encodeURIComponent(DEEP_LINK_PATH)}$`),
      );

      // Signing in as the shared ChurchAdmin creates a session and bumps its
      // member.last_opened_at; no reader depends on either.
      await signIn({
        page,
        persona: churchAdmin,
      });

      await expect(page).toHaveURL(new RegExp(`${DEEP_LINK_PATH}$`));
      await expect(page.getByTestId('planning-admin-page')).toBeVisible();
    });
  });

  test.describe('already signed in', () => {
    test.use({ storageState: VOLUNTEER_STORAGE_STATE });

    test('the landing route redirects to the dashboard', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);
    });

    test('an authenticated visitor to sign-in is redirected onward', async ({
      page,
    }) => {
      await page.goto('/login');

      await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);
    });
  });
});

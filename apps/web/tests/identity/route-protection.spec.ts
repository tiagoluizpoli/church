import { expect, request, test } from '@playwright/test';
import { z } from 'zod';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import { assertOk, signIn } from '../fixtures/journeys/identity-actions';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  E2E_CHURCH_ADMIN_PASSWORD,
  VOLUNTEER_STORAGE_STATE,
} from '../global-setup';

// #66 — proves the route guards consolidated by #53 behave in a real
// browser: an unauthenticated deep link to a scheduling page sends the
// visitor to sign-in and returns them to that exact page afterwards, the
// landing route redirects to the dashboard, and an authenticated visitor to
// sign-in is sent onward. Open-redirect rejection of external/protocol-
// relative/backslash/encoded/script-scheme targets is a pure function
// (`validateInternalReturnTarget`, its own unit test) and is not repeated
// here.
//
// No journey graph and no scheduling rows are written. The deep-link test signs in as
// global setup's shared, read-only ChurchAdmin (its email read from its own
// storage-state session) and asserts only the page shell, never scheduling
// rows.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const DEEP_LINK_PATH = '/scheduling/planning-cycles';

const SESSION_RESPONSE_SCHEMA = z.object({
  user: z.object({ email: z.string().min(1) }),
});

/** The shared ChurchAdmin's email, from the session its storage state holds. */
async function sharedChurchAdminEmail(): Promise<string> {
  const ctx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_ADMIN_STORAGE_STATE,
  });
  try {
    const res = await ctx.get('/api/auth/get-session');
    await assertOk({ res, action: 'read the shared ChurchAdmin session' });
    return SESSION_RESPONSE_SCHEMA.parse(await res.json()).user.email;
  } finally {
    await ctx.dispose();
  }
}

test.describe('#66 — route protection and deep-link return', () => {
  test.describe('signed out', () => {
    test('an unauthenticated deep link to a scheduling page returns to that exact page after sign-in', async ({
      page,
    }) => {
      const email = await sharedChurchAdminEmail();

      await page.goto(DEEP_LINK_PATH);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?redirect=${encodeURIComponent(DEEP_LINK_PATH)}$`),
      );

      // Signing in as the shared ChurchAdmin creates a session and bumps its
      // member.last_opened_at; no reader depends on either.
      await signIn({
        page,
        persona: { email, password: E2E_CHURCH_ADMIN_PASSWORD },
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

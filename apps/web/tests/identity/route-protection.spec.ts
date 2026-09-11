import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, request, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
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
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.PW_WEB_URL ?? 'http://localhost:4101';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../../server');

// Fixed E2E seed identifier (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS.church) — same convention as the other identity specs.
const CHURCH_ID = 'e2e11111-1111-1111-1111-111111111111';
const PASSWORD = 'correct-horse-battery-staple';
const DEEP_LINK_PATH = '/scheduling/planning-cycles';

interface BootstrapChurchAdminInput {
  email: string;
  name: string;
}

interface InviteChurchAdminResponse {
  id: string;
}

/**
 * A fresh ChurchAdmin with a known password, created by invite + redemption
 * — public sign-up is closed (#62), so this is the only way the spec can
 * type real credentials into the sign-in form rather than reuse
 * global-setup's randomized-email storage states. Joins the already-seeded
 * Church A so the deep-linked scheduling page has data to render.
 */
async function bootstrapChurchAdmin({
  email,
  name,
}: BootstrapChurchAdminInput): Promise<void> {
  const adminCtx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_ADMIN_STORAGE_STATE,
    // Better Auth's organization endpoints run an origin-check middleware
    // that `request.newContext` never satisfies on its own (unlike a real
    // browser navigation) — trust the same web origin the server's CORS
    // config trusts for this e2e run (playwright.config.ts's `PW_WEB_URL`).
    extraHTTPHeaders: { Origin: WEB_URL },
  });
  const res = await adminCtx.post('/api/auth/organization/invite-member', {
    data: { email, role: 'admin', organizationId: CHURCH_ID },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to invite ChurchAdmin (${res.status()}): ${await res.text()}`,
    );
  }
  const invitation = (await res.json()) as InviteChurchAdminResponse;
  await adminCtx.dispose();

  execFileSync(
    'bun',
    [
      '--env-file=../../.env',
      'run',
      'src/scripts/e2e-redeem-church-invitation.ts',
      email,
      name,
      PASSWORD,
      invitation.id,
    ],
    { cwd: SERVER_DIR },
  );
}

function uniqueAdminEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-route-guard-${suffix}@test.com`;
}

interface SignInInput {
  email: string;
}

/** `/login` renders the sign-in view only (#62) — no toggle to reach it. */
async function signIn(page: Page, { email }: SignInInput): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('#66 — route protection and deep-link return', () => {
  test.describe('signed out', () => {
    test('an unauthenticated deep link to a scheduling page returns to that exact page after sign-in', async ({
      page,
    }) => {
      const email = uniqueAdminEmail();
      await bootstrapChurchAdmin({ email, name: 'E2E Route Guard Admin' });

      await page.goto(DEEP_LINK_PATH);
      await expect(page).toHaveURL(
        new RegExp(`/login\\?redirect=${encodeURIComponent(DEEP_LINK_PATH)}$`),
      );

      await signIn(page, { email });

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

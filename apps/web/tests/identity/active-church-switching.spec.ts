import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type APIResponse,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  CHURCH_B_ADMIN_STORAGE_STATE,
} from '../global-setup';

// #67 — proves the Active Church selector and switcher (#54) hold together
// for a real dual-membership User: spec 024 §1.5 / §11.7 item 5. Lands on
// the compare-access selector C because several memberships exist and none
// is active, picks Church A, switches to Church B through the sidebar
// switcher, and the resulting page names neither Church A's real Planning
// Cycle names nor its Ministry name anywhere — a real-value negative
// assertion, not an empty-list one (spec 024 §11.2 rule 2).
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.PW_WEB_URL ?? 'http://localhost:4101';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../../server');

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS) — same convention as the other identity specs.
const CHURCH_A_ID = 'e2e11111-1111-1111-1111-111111111111';
const CHURCH_B_ID = 'e2ebbbbb-1111-1111-1111-111111111111';
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const DECEMBER_CYCLE_ID = 'e2e21111-1111-1111-1111-111111111111';
const US4_CYCLE_ID = 'e2e21111-2222-2222-2222-222222222222';
const CHURCH_A_NAME = 'E2E Church';
const CHURCH_B_NAME = 'E2E ChurchB';
// Real values that only exist inside Church A — the negative assertion
// after switching to Church B names these exact strings (spec 024 §11.2
// rule 2: "name, id and slug", not just an empty-list check).
const CHURCH_A_SLUG = 'e2e-church';
const CHURCH_A_DECEMBER_CYCLE_NAME = 'E2E December cycle';
const CHURCH_A_US4_CYCLE_NAME = 'E2E US4 publish cycle';
const CHURCH_A_MINISTRY_NAME = 'E2E Worship';

const PASSWORD = 'correct-horse-battery-staple';

interface InviteChurchMemberResponse {
  id: string;
}

interface MintedMinistryInvitation {
  id: string;
}

interface BootstrapDualMemberInput {
  email: string;
  name: string;
}

interface RedeemChurchInvitationInput {
  email: string;
  name: string;
  invitationId: string;
}

interface AssertOkInput {
  res: APIResponse;
  action: string;
}

/** Fails loudly on a non-2xx response instead of surfacing a confusing downstream error. */
async function assertOk({ res, action }: AssertOkInput): Promise<void> {
  if (res.ok()) return;
  throw new Error(`Failed to ${action} (${res.status()}): ${await res.text()}`);
}

/**
 * E2E-only stand-in for the still-unbuilt public Church-only redemption
 * journey (#62) — same script every identity spec shells out to. Signs up
 * on the first call and, since the User already exists, signs in and
 * accepts on every call after (issue #67 redeems two Church Invitations for
 * the same dual-membership email).
 */
function redeemChurchInvitation({
  email,
  name,
  invitationId,
}: RedeemChurchInvitationInput): void {
  execFileSync(
    'bun',
    [
      '--env-file=../../.env',
      'run',
      'src/scripts/e2e-redeem-church-invitation.ts',
      email,
      name,
      PASSWORD,
      invitationId,
    ],
    { cwd: SERVER_DIR },
  );
}

/**
 * A real dual-membership User (spec 024 §11.3's `dualMemberAB`, rebuilt here
 * because the server-only identity fixture is never wired into the
 * Playwright harness): a ChurchAdmin with a genuine Volunteer profile in the
 * real "E2E Worship" Ministry of Church A — created via actual Church
 * Invitation + Ministry Invitation redemption, the same product flow issue
 * #64 proved — plus a plain Church Membership in Church B. Two Churches,
 * no active one selected, mirrors `bootstrapChurchAdmin` in
 * route-protection.spec.ts.
 */
async function bootstrapDualMember({
  email,
  name,
}: BootstrapDualMemberInput): Promise<void> {
  const churchAAdminCtx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_ADMIN_STORAGE_STATE,
    // Better Auth's organization endpoints run an origin-check middleware
    // that `request.newContext` never satisfies on its own (unlike a real
    // browser navigation) — trust the same web origin the server's CORS
    // config trusts for this e2e run (playwright.config.ts's `PW_WEB_URL`).
    extraHTTPHeaders: { Origin: WEB_URL },
  });
  const churchAInviteRes = await churchAAdminCtx.post(
    '/api/auth/organization/invite-member',
    { data: { email, role: 'admin', organizationId: CHURCH_A_ID } },
  );
  await assertOk({ res: churchAInviteRes, action: 'invite Church A admin' });
  const churchAInvitation =
    (await churchAInviteRes.json()) as InviteChurchMemberResponse;
  redeemChurchInvitation({
    email,
    name,
    invitationId: churchAInvitation.id,
  });

  const ministryInviteRes = await churchAAdminCtx.post(
    `/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/invitations`,
    {
      data: {
        email,
        ministryAccessLevel: 'volunteer',
        roleIds: [USHER_ROLE_ID],
      },
    },
  );
  await assertOk({
    res: ministryInviteRes,
    action: 'mint Ministry invitation',
  });
  const ministryInvitation =
    (await ministryInviteRes.json()) as MintedMinistryInvitation;
  await churchAAdminCtx.dispose();

  const userCtx = await request.newContext({ baseURL: SERVER_URL });
  const signInRes = await userCtx.post('/api/auth/sign-in/email', {
    data: { email, password: PASSWORD },
  });
  await assertOk({ res: signInRes, action: 'sign in dual member' });
  const acceptRes = await userCtx.post(
    `/api/v1/redemption/ministry/${ministryInvitation.id}/accept`,
    { data: { idempotencyKey: randomUUID() } },
  );
  await assertOk({ res: acceptRes, action: 'accept Ministry invitation' });
  await userCtx.dispose();

  const churchBAdminCtx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_B_ADMIN_STORAGE_STATE,
    extraHTTPHeaders: { Origin: WEB_URL },
  });
  const churchBInviteRes = await churchBAdminCtx.post(
    '/api/auth/organization/invite-member',
    { data: { email, role: 'member', organizationId: CHURCH_B_ID } },
  );
  await assertOk({ res: churchBInviteRes, action: 'invite Church B member' });
  const churchBInvitation =
    (await churchBInviteRes.json()) as InviteChurchMemberResponse;
  await churchBAdminCtx.dispose();

  redeemChurchInvitation({
    email,
    name,
    invitationId: churchBInvitation.id,
  });
}

function uniqueDualMemberEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-dual-member-${suffix}@test.com`;
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

interface ChurchOptionRowInput {
  page: Page;
  churchId: string;
}

/**
 * Selector C renders every Church twice — a mobile card list (`md:hidden`)
 * and a desktop table (`hidden md:block`) — both physically present, one
 * hidden by viewport. `select-church.tsx` keys each row's `data-testid` by
 * `church.churchId` (matching the `planning-cycle-row-${id}` convention
 * elsewhere in this app), so `:visible` is still needed to pick the one
 * layout actually on screen at the default desktop viewport.
 */
function churchOptionRow({ page, churchId }: ChurchOptionRowInput) {
  return page.locator(
    `[data-testid="select-church-option-${churchId}"]:visible`,
  );
}

test.describe('#67 — Active Church selection and switching', () => {
  test('a dual-membership User selects Church A, switches to Church B, and Church A leaves no remnant', async ({
    page,
  }) => {
    const email = uniqueDualMemberEmail();
    await bootstrapDualMember({ email, name: 'E2E Dual Member' });

    await page.goto('/login');
    await signIn(page, { email });

    // AC2 — several Church Memberships and no Active Church shows selector C.
    await expect(page).toHaveURL(/\/select-church(\?.*)?$/);
    await expect(
      churchOptionRow({ page, churchId: CHURCH_A_ID }),
    ).toContainText(CHURCH_A_NAME);
    await expect(
      churchOptionRow({ page, churchId: CHURCH_B_ID }),
    ).toContainText(CHURCH_B_NAME);

    await churchOptionRow({ page, churchId: CHURCH_A_ID }).click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const statusAfterA = await page.request.get(
      `${SERVER_URL}/api/v1/active-church/status`,
    );
    expect((await statusAfterA.json()).churchId).toBe(CHURCH_A_ID);

    // Prove Church A's real values are actually on the page before the
    // switch — otherwise their later absence would prove nothing.
    await page.goto('/scheduling/planning-cycles');
    await expect(page.getByTestId('planning-admin-page')).toBeVisible();
    await expect(
      page.getByTestId(`planning-cycle-row-${DECEMBER_CYCLE_ID}`),
    ).toContainText(CHURCH_A_DECEMBER_CYCLE_NAME);
    await expect(
      page.getByTestId(`planning-cycle-row-${US4_CYCLE_ID}`),
    ).toContainText(CHURCH_A_US4_CYCLE_NAME);

    // The sidebar switcher (#54) — spec 024 §1.5 places it above the
    // Church-scoped nav, not inside `UserMenu` (the User-identity menu).
    await page
      .getByTestId('sidebar')
      .getByRole('button', { name: 'Switch Church' })
      .click();
    await expect(page).toHaveURL(/\/select-church(\?.*)?$/);

    await churchOptionRow({ page, churchId: CHURCH_B_ID }).click();
    // Church B has no scheduling access, so the "preserve" route policy
    // falls back to the dashboard (spec 024 §1.5) once the switch commits.
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const statusAfterB = await page.request.get(
      `${SERVER_URL}/api/v1/active-church/status`,
    );
    expect((await statusAfterB.json()).churchId).toBe(CHURCH_B_ID);

    // AC3 — Church A's real name/identifiers appear nowhere in the
    // rendered page. Nothing in this test has reloaded the page since
    // `/login`, so the client-side query cache built while Church A was
    // active is still live in memory — a `page.goto` here would wipe it and
    // prove nothing (TanStack Query's `ensureQueryData`, which
    // `planning-cycles.tsx`'s `beforeLoad` calls, returns an existing cache
    // entry immediately without a network request whenever one is present,
    // stale or not: see `ensureQueryData` in
    // `@tanstack/query-core/src/queryClient.ts`). Re-entering the route via
    // a real in-app link click is the only way this check can actually fail
    // against a broken `clearActiveChurchScopedCache` that left Church A's
    // `['planning-cycles']` entry behind. This dual member also has no
    // Ministry access in Church B, so a correctly-cleared cache/session
    // makes this route's own guard bounce straight back to `/dashboard` —
    // never rendering, let alone leaking, Church A's cycle list.
    await page
      .getByTestId('sidebar')
      .getByRole('link', { name: 'Cycles' })
      .click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(CHURCH_A_DECEMBER_CYCLE_NAME);
    expect(bodyText).not.toContain(CHURCH_A_US4_CYCLE_NAME);
    expect(bodyText).not.toContain(CHURCH_A_MINISTRY_NAME);
    expect(bodyText).not.toContain(CHURCH_A_ID);
    expect(bodyText).not.toContain(CHURCH_A_SLUG);
  });
});

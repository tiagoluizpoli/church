import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, request, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

// #64/DL#107 — a Church Member who does not yet volunteer (spec 024 §11.3's
// `memberOnlyA` — the member-but-not-Volunteer state), signed out, opens a
// Ministry Invitation, signs in, returns to the invitation and accepts it,
// gaining a Volunteer profile for the first time together with Ministry
// access. Also proves declining a Ministry-only invitation rejects only that
// invitation.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.PW_WEB_URL ?? 'http://localhost:4101';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../../server');

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS) — same convention as the other identity/scheduling specs.
const CHURCH_ID = 'e2e11111-1111-1111-1111-111111111111';
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const CARE_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333332';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
const CARE_HOST_ROLE_ID = 'e2e55555-5555-5555-5555-555555555553';

const PASSWORD = 'correct-horse-battery-staple';

interface MintedInvitation {
  id: string;
  kind: 'ministry-only' | 'chained';
  redemptionPath: string;
}

interface MintInvitationInput {
  ministryId: string;
  email: string;
  roleIds: string[];
}

async function mintInvitation({
  ministryId,
  email,
  roleIds,
}: MintInvitationInput): Promise<MintedInvitation> {
  const adminCtx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_ADMIN_STORAGE_STATE,
  });
  const res = await adminCtx.post(
    `/api/v1/admin/ministries/${ministryId}/invitations`,
    { data: { email, ministryAccessLevel: 'volunteer', roleIds } },
  );
  if (!res.ok()) {
    throw new Error(
      `Failed to mint invitation (${res.status()}): ${await res.text()}`,
    );
  }
  const invitation = (await res.json()) as MintedInvitation;
  await adminCtx.dispose();
  return invitation;
}

interface AcceptMinistryInvitationOutcome {
  kind: string;
  volunteerId?: string;
}

interface MinistryOption {
  id: string;
  name: string;
}

interface VolunteerDashboardMinistryOptions {
  ministryOptions: MinistryOption[];
}

interface BootstrapChurchMemberOnlyInput {
  email: string;
  name: string;
}

interface InviteChurchMemberResponse {
  id: string;
}

/**
 * A genuine "member-but-not-Volunteer" Church Member (spec 024 §11.3's
 * `memberOnlyA`): a plain Better Auth Church Membership with no Ministry
 * Membership and therefore no Volunteer profile at all — the starting state
 * the browser-driven Ministry Invitation acceptance below must turn into a
 * first-ever Volunteer profile.
 *
 * Mirrors `apps/web/tests/global-setup.ts`'s bootstrap for the
 * TeamLeader/Volunteer personas: invite through Better Auth's own
 * `organization` plugin, then redeem in-process via
 * `e2e-redeem-church-invitation.ts`, since public sign-up is closed at HTTP
 * and the app has no Church-only redemption UI yet (spec 024 §14).
 */
async function bootstrapChurchMemberOnly({
  email,
  name,
}: BootstrapChurchMemberOnlyInput): Promise<void> {
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
    data: { email, role: 'member', organizationId: CHURCH_ID },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to invite Church Member (${res.status()}): ${await res.text()}`,
    );
  }
  const invitation = (await res.json()) as InviteChurchMemberResponse;
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

function uniqueMemberEmail(label: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-existing-${label}-${suffix}@test.com`;
}

interface SignInInput {
  email: string;
}

/** `/login` renders the sign-in view only (issue #62) — no toggle to reach it. */
async function signIn(page: Page, { email }: SignInInput): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('DL#107 — an existing Church Member redeems a Ministry Invitation', () => {
  test('signed out, with Church Membership but no Volunteer profile, opens a Ministry invitation, signs in, returns, and accepts — gaining a Volunteer profile and Ministry access for the first time', async ({
    page,
  }) => {
    const email = uniqueMemberEmail('accept');
    await bootstrapChurchMemberOnly({
      email,
      name: 'E2E Non-Volunteer Member',
    });

    const invitation = await mintInvitation({
      ministryId: WORSHIP_MINISTRY_ID,
      email,
      roleIds: [USHER_ROLE_ID],
    });
    expect(invitation.kind).toBe('ministry-only');

    await page.goto(invitation.redemptionPath);
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    await signIn(page, { email });
    await expect(page).toHaveURL(
      new RegExp(`/invitations/ministry/${invitation.id}$`),
    );
    await expect(
      page.getByRole('heading', { name: /Join E2E Worship/ }),
    ).toBeVisible();

    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/redemption/ministry/${invitation.id}/accept`),
      ),
      page.getByRole('button', { name: 'Accept' }).click(),
    ]);
    const acceptOutcome =
      (await acceptResponse.json()) as AcceptMinistryInvitationOutcome;
    expect(acceptOutcome.kind).toBe('full-success');
    expect(acceptOutcome.volunteerId).toEqual(expect.any(String));

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const statusResponse = await page.request.get(
      `${SERVER_URL}/api/v1/active-church/status`,
    );
    expect((await statusResponse.json()).churchId).toBe(CHURCH_ID);

    const dashboardResponse = await page.request.get(
      `${SERVER_URL}/api/v1/volunteer/dashboard`,
    );
    const { ministryOptions } =
      (await dashboardResponse.json()) as VolunteerDashboardMinistryOptions;
    expect(ministryOptions.map((option) => option.id)).toEqual([
      WORSHIP_MINISTRY_ID,
    ]);
  });

  test('signs in and declines a Ministry-only invitation, which does not grant access', async ({
    page,
  }) => {
    const email = uniqueMemberEmail('decline');
    await bootstrapChurchMemberOnly({
      email,
      name: 'E2E Declining Member',
    });

    const invitation = await mintInvitation({
      ministryId: CARE_MINISTRY_ID,
      email,
      roleIds: [CARE_HOST_ROLE_ID],
    });
    expect(invitation.kind).toBe('ministry-only');

    await page.goto(invitation.redemptionPath);
    await signIn(page, { email });
    await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible();

    await page.getByRole('button', { name: 'Decline' }).click();
    await expect(
      page.getByText(/only your invitation to E2E Care/),
    ).toBeVisible();

    const [declineResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response
          .url()
          .endsWith(`/redemption/ministry/${invitation.id}/decline`),
      ),
      page.getByRole('button', { name: 'Yes, decline' }).click(),
    ]);
    expect(await declineResponse.json()).toEqual({ kind: 'declined' });
    await expect(
      page.getByText("You've declined this invitation."),
    ).toBeVisible();

    await page.goto(invitation.redemptionPath);
    await expect(page.getByText(/no longer available/i)).toBeVisible();
  });
});

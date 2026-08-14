import { expect, type Page, request, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

// #58/#107 — an existing Church Member, signed out, opens a Ministry
// Invitation, signs in, returns to the invitation and accepts it, gaining a
// Volunteer profile and Ministry access without losing any access they
// already held. Also proves declining a Ministry-only invitation rejects
// only that invitation.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

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

interface FetchDebugVerificationCodeInput {
  invitationId: string;
}

interface DebugVerificationCodeResponse {
  code: string;
}

async function fetchDebugVerificationCode({
  invitationId,
}: FetchDebugVerificationCodeInput): Promise<string> {
  const ctx = await request.newContext({ baseURL: SERVER_URL });
  const res = await ctx.get(
    `/api/v1/redemption/church/${invitationId}/debug-code`,
  );
  if (!res.ok()) {
    throw new Error(
      `No verification code captured for ${invitationId} (${res.status()})`,
    );
  }
  const { code } = (await res.json()) as DebugVerificationCodeResponse;
  await ctx.dispose();
  return code;
}

interface RedeemNewUserOutcome {
  kind:
    | 'full-success'
    | 'church-only'
    | 'retryable-failure'
    | 'terminal-failure';
}

interface BootstrapExistingChurchMemberInput {
  email: string;
  name: string;
}

/**
 * Creates a real, redeemed account through the same chained-invitation
 * public API `us1-chained-new-person.spec.ts` drives through the browser —
 * this spec drives it headlessly instead, since becoming a Church Member is
 * already proven elsewhere and only the resulting account (with a known
 * password) matters here.
 */
async function bootstrapExistingChurchMember({
  email,
  name,
}: BootstrapExistingChurchMemberInput): Promise<void> {
  const invitation = await mintInvitation({
    ministryId: WORSHIP_MINISTRY_ID,
    email,
    roleIds: [USHER_ROLE_ID],
  });
  expect(invitation.kind).toBe('chained');

  const ctx = await request.newContext({ baseURL: SERVER_URL });
  const codeRes = await ctx.post(
    `/api/v1/redemption/church/${invitation.id}/code`,
  );
  if (!codeRes.ok()) {
    throw new Error(`Failed to request verification code: ${codeRes.status()}`);
  }
  const code = await fetchDebugVerificationCode({
    invitationId: invitation.id,
  });
  const redeemRes = await ctx.post(
    `/api/v1/redemption/church/${invitation.id}/redeem`,
    {
      data: {
        name,
        password: PASSWORD,
        code,
        idempotencyKey: crypto.randomUUID(),
      },
    },
  );
  const outcome = (await redeemRes.json()) as RedeemNewUserOutcome;
  if (outcome.kind !== 'full-success') {
    throw new Error(`Bootstrap redemption failed: ${outcome.kind}`);
  }
  await ctx.dispose();
}

function uniqueMemberEmail(label: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-existing-${label}-${suffix}@test.com`;
}

interface SignInInput {
  email: string;
}

/** The route's sign-in view is reached behind a "Sign In" toggle — sign-up is the default view (spec §3 covers suppressing sign-up itself; toggling is unaffected by this ticket). */
async function signIn(page: Page, { email }: SignInInput): Promise<void> {
  await page
    .getByRole('button', { name: 'Already have an account? Sign In' })
    .click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('DL#107 — an existing Church Member redeems a Ministry Invitation', () => {
  test('signed out, opens the invitation, signs in, returns, and accepts — gaining Ministry access without losing existing access', async ({
    page,
  }) => {
    const email = uniqueMemberEmail('accept');
    await bootstrapExistingChurchMember({ email, name: 'E2E Existing Member' });

    const invitation = await mintInvitation({
      ministryId: CARE_MINISTRY_ID,
      email,
      roleIds: [CARE_HOST_ROLE_ID],
    });
    expect(invitation.kind).toBe('ministry-only');

    await page.goto(invitation.redemptionPath);
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    await signIn(page, { email });
    await expect(page).toHaveURL(
      new RegExp(`/invitations/ministry/${invitation.id}$`),
    );
    await expect(
      page.getByRole('heading', { name: /Join E2E Care/ }),
    ).toBeVisible();

    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/redemption/ministry/${invitation.id}/accept`),
      ),
      page.getByRole('button', { name: 'Accept' }).click(),
    ]);
    const acceptOutcome = (await acceptResponse.json()) as {
      kind: string;
      volunteerId?: string;
    };
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
    const { ministryOptions } = (await dashboardResponse.json()) as {
      ministryOptions: { id: string; name: string }[];
    };
    expect(ministryOptions.map((option) => option.id)).toEqual(
      expect.arrayContaining([CARE_MINISTRY_ID, WORSHIP_MINISTRY_ID]),
    );
  });

  test('signs in and declines a Ministry-only invitation, which does not grant access', async ({
    page,
  }) => {
    const email = uniqueMemberEmail('decline');
    await bootstrapExistingChurchMember({
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

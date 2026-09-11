import { expect, type Page, request, test } from '@playwright/test';
import { CHURCH_ADMIN_STORAGE_STATE } from '../global-setup';

// #63/DL#100 — a person outside the Church (the "outsider" — never before
// registered) follows a chained Ministry Invitation link, verifies a
// one-time code read from the capture `EmailSender` (never a log or the
// database), and becomes a Volunteer in the invited Ministry with the
// invitation Church active, landing on /dashboard with that Ministry access
// visible. Proves the real emailed link (composed by `redemptionPathFor`)
// resolves against the real redemption API end to end. Failure copy, expiry
// handling and checkpoint atomicity are proved below this seam (L1/L2), not
// re-asserted here.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS). The web package stays DB-tooling-free, so specs reference these
// well-known UUIDs directly — same convention as the scheduling specs.
const CHURCH_ID = 'e2e11111-1111-1111-1111-111111111111';
const WORSHIP_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const USHER_ROLE_ID = 'e2e55555-5555-5555-5555-555555555551';
// The second tenant `global-setup.ts` provisions alongside CHURCH_ID — the
// "two-Church" half of the environment this outsider redeems into. Naming
// its real id/name lets the isolation assertion below prove absence, not
// just an empty-looking list (spec 024 §11.2).
const CHURCH_B_ID = 'e2ebbbbb-1111-1111-1111-111111111111';
const CHURCH_B_NAME = 'E2E ChurchB';

interface MintedInvitation {
  id: string;
  kind: 'ministry-only' | 'chained';
  redemptionPath: string;
}

interface MintChainedInvitationInput {
  email: string;
}

async function mintChainedInvitation({
  email,
}: MintChainedInvitationInput): Promise<MintedInvitation> {
  const adminCtx = await request.newContext({
    baseURL: SERVER_URL,
    storageState: CHURCH_ADMIN_STORAGE_STATE,
  });
  const res = await adminCtx.post(
    `/api/v1/admin/ministries/${WORSHIP_MINISTRY_ID}/invitations`,
    {
      data: {
        email,
        ministryAccessLevel: 'volunteer',
        roleIds: [USHER_ROLE_ID],
      },
    },
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

type RedeemOutcome =
  | { kind: 'full-success'; volunteerId: string }
  | { kind: 'church-only' }
  | { kind: 'retryable-failure'; reason: string }
  | { kind: 'terminal-failure'; reason: string };

interface MinistryOption {
  id: string;
  name: string;
}

interface VolunteerDashboardMinistryOptions {
  ministryOptions: MinistryOption[];
}

interface ActiveChurchStatusResponse {
  churchId: string;
}

interface ChurchSelectionOption {
  churchId: string;
  name: string;
}

interface ChurchOptionsResponse {
  churches: ChurchSelectionOption[];
}

interface FetchJsonInput {
  page: Page;
  url: string;
}

async function fetchJson<T>({ page, url }: FetchJsonInput): Promise<T> {
  const response = await page.request.get(url);
  if (!response.ok()) {
    throw new Error(
      `GET ${url} failed (${response.status()}): ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

function uniqueOutsiderEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-outsider-${suffix}@test.com`;
}

test.describe('DL#100 — a new person redeems a chained invitation', () => {
  test('signs up, verifies a code, becomes a Volunteer, and lands on the dashboard with the invitation Church active', async ({
    page,
  }) => {
    const email = uniqueOutsiderEmail();
    const invitation = await mintChainedInvitation({ email });
    expect(invitation.kind).toBe('chained');

    await page.goto(invitation.redemptionPath);
    await expect(page.getByRole('heading', { name: /Join/ })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(page.getByText('Worship')).toBeVisible();

    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(
      page.getByRole('button', { name: /Resend in \d+s/ }),
    ).toBeVisible();

    const code = await fetchDebugVerificationCode({
      invitationId: invitation.id,
    });

    await page.getByLabel('Name').fill('E2E Outsider');
    await page.getByLabel('Password').fill('correct-horse-battery-staple');
    await page.getByPlaceholder('123456').fill(code);
    const [redeemResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/redemption/church/${invitation.id}/redeem`),
      ),
      page.getByRole('button', { name: 'Join' }).click(),
    ]);
    const redeemOutcome = (await redeemResponse.json()) as RedeemOutcome;
    expect(redeemOutcome.kind).toBe('full-success');
    if (redeemOutcome.kind === 'full-success') {
      expect(redeemOutcome.volunteerId).toEqual(expect.any(String));
      expect(redeemOutcome.volunteerId.length).toBeGreaterThan(0);
    }

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const status = await fetchJson<ActiveChurchStatusResponse>({
      page,
      url: `${SERVER_URL}/api/v1/active-church/status`,
    });
    expect(status.churchId).toBe(CHURCH_ID);

    const { ministryOptions } =
      await fetchJson<VolunteerDashboardMinistryOptions>({
        page,
        url: `${SERVER_URL}/api/v1/volunteer/dashboard`,
      });
    expect(ministryOptions.map((option) => option.id)).toContain(
      WORSHIP_MINISTRY_ID,
    );

    // Two-Church isolation: this outsider redeemed into exactly the
    // inviting Church, never touching the environment's other real tenant.
    const { churches } = await fetchJson<ChurchOptionsResponse>({
      page,
      url: `${SERVER_URL}/api/v1/active-church/options`,
    });
    expect(churches.map((church) => church.churchId)).toEqual([CHURCH_ID]);
    expect(churches.some((church) => church.churchId === CHURCH_B_ID)).toBe(
      false,
    );
    expect(churches.some((church) => church.name === CHURCH_B_NAME)).toBe(
      false,
    );
  });
});

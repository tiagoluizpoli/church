import { expect, request, test } from '@playwright/test';
import { assertServedFromPinnedTarget } from '../fixtures/e2e-target';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  assertOk,
  fetchActiveChurchStatus,
  fetchJson,
  fetchVolunteerMinistryOptions,
  type MintedMinistryInvitation,
  mintMinistryInvitationAs,
} from '../fixtures/journeys/identity-actions';
import {
  loadMinistryRedemptionJourney,
  type MinistryRedemptionJourney,
} from '../fixtures/journeys/ministry-redemption';

// #63/DL#100 — a person outside the Church (the "outsider" — never before
// registered) follows a chained Ministry Invitation link, verifies a
// one-time code read from the capture `EmailSender` (never a log or the
// database), and becomes a Volunteer in the invited Ministry with the
// invitation Church active, landing on /dashboard with that Ministry access
// visible. Proves the real emailed link (composed by `redemptionPathFor`)
// resolves against the real redemption API end to end. Failure copy, expiry
// handling and checkpoint atomicity are proved below this seam (L1/L2), not
// re-asserted here. The inviting Church (A) and the second tenant (B) the
// outsider must never join are the journey's own graph (`ministry-redemption`
// recipe); the outsider is created by the redemption itself.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface MintChainedInvitationInput {
  journey: MinistryRedemptionJourney;
  email: string;
}

async function mintChainedInvitation({
  journey,
  email,
}: MintChainedInvitationInput): Promise<MintedMinistryInvitation> {
  const { worship } = journey.churchA.ministries;
  return await mintMinistryInvitationAs({
    persona: journey.churchA.personas.admin,
    ministryId: worship.id,
    email,
    roleIds: [worship.roles.usher.id],
  });
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
  try {
    const res = await ctx.get(
      `/api/v1/redemption/church/${invitationId}/debug-code`,
    );
    await assertOk({
      res,
      action: `read the verification code captured for ${invitationId}`,
    });
    const { code } = (await res.json()) as DebugVerificationCodeResponse;
    return code;
  } finally {
    await ctx.dispose();
  }
}

interface FullSuccessOutcome {
  kind: 'full-success';
  volunteerId: string;
}

interface ChurchOnlyOutcome {
  kind: 'church-only';
}

interface RetryableFailureOutcome {
  kind: 'retryable-failure';
  reason: string;
}

interface TerminalFailureOutcome {
  kind: 'terminal-failure';
  reason: string;
}

type RedeemOutcome =
  | FullSuccessOutcome
  | ChurchOnlyOutcome
  | RetryableFailureOutcome
  | TerminalFailureOutcome;

interface ChurchSelectionOption {
  churchId: string;
  name: string;
}

interface ChurchOptionsResponse {
  churches: ChurchSelectionOption[];
}

function uniqueOutsiderEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-outsider-${suffix}@test.com`;
}

test.describe('DL#100 — a new person redeems a chained invitation', () => {
  test('signs up, verifies a code, becomes a Volunteer, and lands on the dashboard with the invitation Church active', async ({
    page,
  }, testInfo) => {
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const email = uniqueOutsiderEmail();
    const invitation = await mintChainedInvitation({ journey, email });
    expect(invitation.kind).toBe('chained');

    await page.goto(invitation.redemptionPath);
    await expect(page.getByRole('heading', { name: /Join/ })).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await expect(
      page.getByText(journey.churchA.ministries.worship.name),
    ).toBeVisible();

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
    // #253 redemption gate: the invitation above was provisioned and is now
    // redeemed against the run's one pinned target (the original failure
    // redeemed against a different database: INVITATION_NOT_FOUND).
    assertServedFromPinnedTarget({
      response: redeemResponse,
      step: 'redeem chained invitation',
    });
    const redeemOutcome = (await redeemResponse.json()) as RedeemOutcome;
    expect(redeemOutcome.kind).toBe('full-success');
    if (redeemOutcome.kind === 'full-success') {
      expect(redeemOutcome.volunteerId).toEqual(expect.any(String));
      expect(redeemOutcome.volunteerId.length).toBeGreaterThan(0);
    }

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    const status = await fetchActiveChurchStatus({ request: page.request });
    expect(status.churchId).toBe(journey.churchA.church.id);

    const ministryOptions = await fetchVolunteerMinistryOptions({
      request: page.request,
    });
    expect(ministryOptions.map((option) => option.id)).toContain(
      journey.churchA.ministries.worship.id,
    );

    // Two-Church isolation: this outsider redeemed into exactly the
    // inviting Church, never touching the environment's other real tenant.
    const { churches } = await fetchJson<ChurchOptionsResponse>({
      request: page.request,
      path: '/api/v1/active-church/options',
    });
    expect(churches.map((church) => church.churchId)).toEqual([
      journey.churchA.church.id,
    ]);
    expect(
      churches.some((church) => church.churchId === journey.churchB.church.id),
    ).toBe(false);
    expect(
      churches.some((church) => church.name === journey.churchB.church.name),
    ).toBe(false);
  });
});

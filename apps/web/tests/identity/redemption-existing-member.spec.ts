import { expect, test } from '@playwright/test';
import { assertServedFromPinnedTarget } from '../fixtures/e2e-target';
import {
  type AcceptMinistryInvitationOutcome,
  fetchActiveChurchStatus,
  fetchVolunteerMinistryOptions,
  type MintedMinistryInvitation,
  mintMinistryInvitationAs,
  signIn,
} from '../fixtures/journeys/identity-actions';
import {
  loadMinistryRedemptionJourney,
  type MinistryRedemptionJourney,
} from '../fixtures/journeys/ministry-redemption';

// #64/DL#107 — a Church Member who does not yet volunteer (spec 024 §11.3's
// `memberOnlyA` — the member-but-not-Volunteer state), signed out, opens a
// Ministry Invitation, signs in, returns to the invitation and accepts it,
// gaining a Volunteer profile for the first time together with Ministry
// access. Also proves declining a Ministry-only invitation rejects only that
// invitation. The Church, its admin, Ministries and the Member are the
// journey's own graph (`ministry-redemption` recipe); the invitations are
// minted and redeemed through the product.
interface MintInvitationInput {
  journey: MinistryRedemptionJourney;
  ministryId: string;
  roleIds: string[];
}

/** Church A's admin invites the journey's Member to one of its Ministries. */
async function mintInvitation({
  journey,
  ministryId,
  roleIds,
}: MintInvitationInput): Promise<MintedMinistryInvitation> {
  return await mintMinistryInvitationAs({
    persona: journey.churchA.personas.admin,
    ministryId,
    email: journey.memberOnly.email,
    roleIds,
  });
}

test.describe('DL#107 — an existing Church Member redeems a Ministry Invitation', () => {
  test('signed out, with Church Membership but no Volunteer profile, opens a Ministry invitation, signs in, returns, and accepts — gaining a Volunteer profile and Ministry access for the first time', async ({
    page,
  }, testInfo) => {
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const { memberOnly } = journey;
    const { worship } = journey.churchA.ministries;

    const invitation = await mintInvitation({
      journey,
      ministryId: worship.id,
      roleIds: [worship.roles.usher.id],
    });
    expect(invitation.kind).toBe('ministry-only');

    await page.goto(invitation.redemptionPath);
    await expect(page).toHaveURL(/\/login(\?.*)?$/);

    await signIn({ page, persona: memberOnly });
    await expect(page).toHaveURL(
      new RegExp(`/invitations/ministry/${invitation.id}$`),
    );
    await expect(
      page.getByRole('heading', { name: `Join ${worship.name}` }),
    ).toBeVisible();

    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/redemption/ministry/${invitation.id}/accept`),
      ),
      page.getByRole('button', { name: 'Accept' }).click(),
    ]);
    // #253 redemption gate: provisioned (above) and redeemed here against
    // the run's one pinned target.
    assertServedFromPinnedTarget({
      response: acceptResponse,
      step: 'redeem Ministry Invitation',
    });
    const acceptOutcome =
      (await acceptResponse.json()) as AcceptMinistryInvitationOutcome;
    expect(acceptOutcome.kind).toBe('full-success');
    expect(acceptOutcome.volunteerId).toEqual(expect.any(String));

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    expect(
      await fetchActiveChurchStatus({ request: page.request }),
    ).toMatchObject({ churchId: journey.churchA.church.id });

    const ministryOptions = await fetchVolunteerMinistryOptions({
      request: page.request,
    });
    expect(ministryOptions.map((option) => option.id)).toEqual([worship.id]);
  });

  test('signs in and declines a Ministry-only invitation, which does not grant access', async ({
    page,
  }, testInfo) => {
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const { memberOnly } = journey;
    const { care } = journey.churchA.ministries;

    const invitation = await mintInvitation({
      journey,
      ministryId: care.id,
      roleIds: [care.roles.careHost.id],
    });
    expect(invitation.kind).toBe('ministry-only');

    await page.goto(invitation.redemptionPath);
    await signIn({ page, persona: memberOnly });
    await expect(page.getByRole('button', { name: 'Decline' })).toBeVisible();

    await page.getByRole('button', { name: 'Decline' }).click();
    await expect(
      page.getByText(`only your invitation to ${care.name}`),
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

import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { assertServedFromPinnedTarget } from '@/tests/fixtures/e2e-target';
import {
  type AcceptMinistryInvitationOutcome,
  fetchActiveChurchStatus,
  fetchJson,
  fetchVolunteerMinistryOptions,
  type MintedMinistryInvitation,
  mintAdminInvitationAs,
  mintMinistryInvitationAs,
  revokeMinistryInvitationAs,
  signIn,
} from '@/tests/fixtures/journeys/identity-actions';
import {
  loadMinistryRedemptionJourney,
  type MinistryRedemptionJourney,
} from '@/tests/fixtures/journeys/ministry-redemption';

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
      page.getByRole('heading', {
        name: m.ministry_invitation_title(
          { ministryName: worship.name },
          { locale: 'pt-BR' },
        ),
      }),
    ).toBeVisible();

    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/redemption/ministry/${invitation.id}/accept`),
      ),
      page
        .getByRole('button', {
          name: m.ministry_invitation_accept({}, { locale: 'pt-BR' }),
        })
        .click(),
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

    await expect(page).toHaveURL(/:\d+\/(\?.*)?$/);

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
    await expect(
      page.getByRole('button', {
        name: m.ministry_invitation_decline({}, { locale: 'pt-BR' }),
      }),
    ).toBeVisible();

    await page
      .getByRole('button', {
        name: m.ministry_invitation_decline({}, { locale: 'pt-BR' }),
      })
      .click();
    await expect(
      page.getByText(
        m.ministry_invitation_decline_notice_ministry_only(
          { ministryName: care.name },
          { locale: 'pt-BR' },
        ),
      ),
    ).toBeVisible();

    const [declineResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response
          .url()
          .endsWith(`/redemption/ministry/${invitation.id}/decline`),
      ),
      page
        .getByRole('button', {
          name: m.ministry_invitation_decline_confirm({}, { locale: 'pt-BR' }),
        })
        .click(),
    ]);
    expect(await declineResponse.json()).toEqual({ kind: 'declined' });
    await expect(
      page.getByText(
        m.ministry_invitation_declined_toast({}, { locale: 'pt-BR' }),
      ),
    ).toBeVisible();

    await page.goto(invitation.redemptionPath);
    await expect(
      page.getByText(
        m.ministry_invitation_unavailable_description({}, { locale: 'pt-BR' }),
      ),
    ).toBeVisible();
  });
});

const PT = { locale: 'pt-BR' } as const;
const PHONE_VIEWPORT = { width: 390, height: 844 };

interface MintChurchOfferInput {
  journey: MinistryRedemptionJourney;
}

/** Church A offers the account-only User Worship (Volunteer, Usher) and Care (leader, no Roles). */
async function mintChurchOffer({ journey }: MintChurchOfferInput) {
  const { worship, care } = journey.churchA.ministries;
  const persona = journey.churchA.personas.admin;
  const email = journey.accountOnly.email;
  const worshipHalf = await mintMinistryInvitationAs({
    persona,
    ministryId: worship.id,
    email,
    roleIds: [worship.roles.usher.id],
  });
  const careHalf = await mintMinistryInvitationAs({
    persona,
    ministryId: care.id,
    email,
    roleIds: [],
    ministryAccessLevel: 'leader',
  });
  expect(worshipHalf.kind).toBe('chained');
  expect(careHalf.redemptionPath).toBe(worshipHalf.redemptionPath);
  return { worshipHalf, careHalf };
}

test.describe('#861 — a signed-up recipient reviews and accepts exactly the bundled Church offer', () => {
  test('opens the Church link, signs in, sees every grant, is refused after an access change, and accepts the refreshed offer by keyboard on a phone', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const { accountOnly } = journey;
    const { worship, care } = journey.churchA.ministries;
    const { worshipHalf, careHalf } = await mintChurchOffer({ journey });

    await page.goto(worshipHalf.redemptionPath);
    await page
      .getByRole('link', { name: m.join_sign_in_to_review({}, PT) })
      .click();
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await signIn({ page, persona: accountOnly });
    // Any half of the offer opens the same review of the whole bundle.
    const reviewedHalf = new RegExp(
      `/invitations/ministry/(${worshipHalf.id}|${careHalf.id})$`,
    );
    await expect(page).toHaveURL(reviewedHalf);
    const reviewedId = page.url().match(reviewedHalf)?.[1];

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: m.ministry_invitation_bundle_title(
          { churchName: journey.churchA.church.name },
          PT,
        ),
      }),
    ).toBeVisible();
    await expect(
      page.getByText(m.ministry_invitation_bundle_explainer({}, PT)),
    ).toBeVisible();
    await expect(
      page.getByText(m.join_church_access_member({}, PT), { exact: true }),
    ).toBeVisible();
    const worshipGrant = page.getByRole('region', { name: worship.name });
    await expect(
      worshipGrant.getByText(m.ministry_invitation_access_volunteer({}, PT)),
    ).toBeVisible();
    await expect(
      worshipGrant.getByText(worship.roles.usher.name),
    ).toBeVisible();
    await expect(
      worshipGrant.getByText(journey.churchA.personas.admin.name),
    ).toBeVisible();
    const careGrant = page.getByRole('region', { name: care.name });
    await expect(
      careGrant.getByText(m.ministry_invitation_access_leader({}, PT)),
    ).toBeVisible();
    await expect(
      careGrant.getByText(m.ministry_invitation_roles_none({}, PT)),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // UI-review evidence: the full disclosure at phone width.
    const reviewShot = testInfo.outputPath('bundle-review-phone.png');
    await page.screenshot({ path: reviewShot, fullPage: true });
    await testInfo.attach('bundle-review-phone', { path: reviewShot });

    // The admin raises the offer to ChurchAdmin after the recipient reviewed it.
    await mintAdminInvitationAs({
      persona: journey.churchA.personas.admin,
      email: accountOnly.email,
    });
    const acceptPath = `/redemption/ministry/${reviewedId}/accept`;
    const [staleResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(acceptPath)),
      page
        .getByRole('button', { name: m.ministry_invitation_accept({}, PT) })
        .click(),
    ]);
    expect(await staleResponse.json()).toEqual({ kind: 'offer-changed' });
    await expect(
      page.getByText(m.ministry_invitation_offer_changed_title({}, PT)),
    ).toBeVisible();
    await expect(
      page.getByText(m.join_church_access_admin({}, PT), { exact: true }),
    ).toBeVisible();
    expect(
      await fetchActiveChurchStatus({ request: page.request }),
    ).not.toMatchObject({ churchId: journey.churchA.church.id });

    const acceptButton = page.getByRole('button', {
      name: m.ministry_invitation_accept({}, PT),
    });
    await acceptButton.focus();
    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(acceptPath)),
      page.keyboard.press('Enter'),
    ]);
    assertServedFromPinnedTarget({
      response: acceptResponse,
      step: 'accept the reviewed Church offer',
    });
    expect(
      ((await acceptResponse.json()) as AcceptMinistryInvitationOutcome).kind,
    ).toBe('full-success');
    await expect(page).toHaveURL(/:\d+\/(\?.*)?$/);

    expect(
      await fetchActiveChurchStatus({ request: page.request }),
    ).toMatchObject({ churchId: journey.churchA.church.id });
    const ministryOptions = await fetchVolunteerMinistryOptions({
      request: page.request,
    });
    expect(ministryOptions.map((option) => option.id).sort()).toEqual(
      [worship.id, care.id].sort(),
    );
    // Setup progress is ChurchAdmin-only: the admin grant landed.
    await fetchJson({
      request: page.request,
      path: '/api/v1/admin/setup-progress',
    });
  });

  test('a wrong login sees no offer details, and a revoked Church link grants nothing', async ({
    page,
  }, testInfo) => {
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const { worship, care } = journey.churchA.ministries;
    const { worshipHalf, careHalf } = await mintChurchOffer({ journey });

    await page.goto(`/invitations/ministry/${worshipHalf.id}`);
    await signIn({ page, persona: journey.memberOnly });
    await expect(
      page.getByRole('heading', {
        name: m.ministry_invitation_wrong_login_title({}, PT),
      }),
    ).toBeVisible();
    await expect(page.getByText(worship.name)).toHaveCount(0);
    await expect(page.getByText(care.name)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: m.ministry_invitation_accept({}, PT) }),
    ).toHaveCount(0);

    for (const half of [worshipHalf, careHalf]) {
      await revokeMinistryInvitationAs({
        persona: journey.churchA.personas.admin,
        ministryId: half === worshipHalf ? worship.id : care.id,
        invitationId: half.id,
      });
    }
    await page.goto(worshipHalf.redemptionPath);
    await expect(
      page.getByText(m.redemption_failure_unavailable_title({}, PT)),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: m.join_sign_in_to_review({}, PT) }),
    ).toHaveCount(0);
  });
});

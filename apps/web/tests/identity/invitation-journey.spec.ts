import { m } from '@church/i18n/messages';
import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import {
  fetchJson,
  fetchVolunteerMinistryOptions,
  findListedInvitation,
  joinViaLink,
} from '@/tests/fixtures/journeys/identity-actions';
import { loadInvitationJourney } from '@/tests/fixtures/journeys/invitation-journey';

// J4 (#667) — the Ministry setup invitation journey, end to end: a ChurchAdmin
// invites a leader from the Invitations page, the leader joins from the
// emailed link and code, invites a Volunteer into their own Ministry with
// Roles from the same page, and the Volunteer joins. Cooldowns, caps,
// permissions, revocation and failure copy are proved below this seam.
const PT = { locale: 'pt-BR' } as const;
const PASSWORD = 'correct-horse-battery-staple';

interface CallerCapabilities {
  isChurchAdmin: boolean;
  ledMinistries: { ministryId: string; name: string }[];
}

interface InviteInput {
  page: Page;
  email: string;
  ministryName: string;
  as: 'leader' | 'volunteer';
  roles: string[];
  pickMinistry: boolean;
}

/** Fills the Invite dialog the way a person would and sends the offer. */
async function invite({
  page,
  email,
  ministryName,
  as,
  roles,
  pickMinistry,
}: InviteInput): Promise<void> {
  await page
    .getByRole('button', { name: m.invitations_invite_open({}, PT) })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(m.invitations_invite_email_label({}, PT)).fill(email);
  if (as === 'leader') {
    await dialog
      .getByRole('radio', { name: m.ministry_invitation_access_leader({}, PT) })
      .click();
  }
  if (pickMinistry) {
    await page
      .getByRole('combobox', {
        name: m.invitations_invite_ministry_label({}, PT),
      })
      .click();
    await page.getByRole('option', { name: ministryName }).click();
  }
  for (const role of roles) {
    await dialog.getByRole('checkbox', { name: role }).check();
  }
  await dialog
    .getByRole('button', { name: m.invitations_invite_submit({}, PT) })
    .click();
  await expect(
    page.getByText(m.invitations_invite_sent_toast({ email }, PT)),
  ).toBeVisible();
}

test.describe('J4 — invite a leader, who invites a Volunteer, and both join', () => {
  test('the admin invites a leader; the leader invites a Volunteer with Roles; both join with the intended authority', async ({
    page,
    browser,
  }, testInfo) => {
    const journey = loadInvitationJourney({ testInfo });
    const { worship } = journey.ministries;
    const baseURL = requiredE2eUrl({ variable: 'PW_WEB_URL' });

    // The admin issues a leader-level offer from the Invitations page.
    await signInPersonaPage({ page, persona: journey.personas.admin });
    await page.goto('/invitations');
    await invite({
      page,
      email: journey.leaderEmail,
      ministryName: worship.name,
      as: 'leader',
      roles: [],
      pickMinistry: true,
    });
    await expect(
      page.getByText(journey.leaderEmail, { exact: true }),
    ).toBeVisible();

    // The joining link is the pending offer's Church Invitation.
    const leaderOffer = await findListedInvitation({
      request: page.request,
      email: journey.leaderEmail,
    });
    expect(leaderOffer.churchInvitationId).toEqual(expect.any(String));

    // The leader joins from that link and the emailed code.
    const leaderContext = await browser.newContext({ baseURL });
    const volunteerContext = await browser.newContext({ baseURL });
    try {
      const leaderPage = await leaderContext.newPage();
      const leaderJoin = await joinViaLink({
        page: leaderPage,
        redemptionPath: `/invitations/church/${leaderOffer.churchInvitationId}`,
        email: journey.leaderEmail,
        name: 'E2E Leader',
        password: PASSWORD,
        churchName: journey.church.name,
      });
      expect(leaderJoin.kind).toBe('full-success');
      await expect(leaderPage).toHaveURL(/:\d+\/(\?.*)?$/);

      // The leader leads exactly the invited Ministry, without ChurchAdmin.
      const capabilities = await fetchJson<CallerCapabilities>({
        request: leaderPage.request,
        path: '/api/v1/caller-capabilities',
      });
      expect(capabilities.isChurchAdmin).toBe(false);
      expect(capabilities.ledMinistries.map((x) => x.ministryId)).toEqual([
        worship.id,
      ]);

      // The leader invites a Volunteer into their own Ministry with a Role.
      await leaderPage.goto('/invitations');
      await invite({
        page: leaderPage,
        email: journey.volunteerEmail,
        ministryName: worship.name,
        as: 'volunteer',
        roles: [worship.roles.usher.name],
        pickMinistry: false,
      });
      // Leaders never see a Church Invitation id (admin-only on the list), so
      // the emailed link is read through the admin's list of the same offer.
      const volunteerOffer = await findListedInvitation({
        request: page.request,
        email: journey.volunteerEmail,
      });

      const volunteerPage = await volunteerContext.newPage();
      const volunteerJoin = await joinViaLink({
        page: volunteerPage,
        redemptionPath: `/invitations/church/${volunteerOffer.churchInvitationId}`,
        email: journey.volunteerEmail,
        name: 'E2E Volunteer',
        password: PASSWORD,
        churchName: journey.church.name,
      });
      expect(volunteerJoin.kind).toBe('full-success');
      expect(volunteerJoin.volunteerId).toEqual(expect.any(String));
      await expect(volunteerPage).toHaveURL(/:\d+\/(\?.*)?$/);

      const options = await fetchVolunteerMinistryOptions({
        request: volunteerPage.request,
      });
      expect(options.map((option) => option.id)).toEqual([worship.id]);

      // The leader's history now shows the Volunteer's accepted offer and Role.
      await leaderPage.goto('/invitations');
      await leaderPage
        .getByRole('combobox', { name: m.invitations_filter_status({}, PT) })
        .click();
      await leaderPage
        .getByRole('option', { name: m.invitations_status_accepted({}, PT) })
        .click();
      const row = leaderPage.getByRole('listitem').filter({
        hasText: journey.volunteerEmail,
      });
      await expect(row).toContainText(worship.roles.usher.name);
      await expect(row).toContainText(m.invitations_status_accepted({}, PT));
    } finally {
      await leaderContext.close();
      await volunteerContext.close();
    }
  });
});

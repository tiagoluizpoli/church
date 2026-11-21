import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { assertServedFromPinnedTarget } from '@/tests/fixtures/e2e-target';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import {
  fetchActiveChurchStatus,
  fetchEmailedJoiningPath,
  signIn,
} from '@/tests/fixtures/journeys/identity-actions';
import { loadMinistryRedemptionJourney } from '@/tests/fixtures/journeys/ministry-redemption';

// #962/#945 — Bruno, a Church A member, is invited Church-only to Church B
// through the product. Signed out, he opens the link, chooses Sign in to
// accept, signs in, reviews and accepts, lands home in Church B, and can
// still switch to Church A.
const PT = { locale: 'pt-BR' } as const;

test.describe('#945 — an existing member accepts a Church-only invitation signed in', () => {
  test('opens the link signed out, signs in to accept, lands in Church B and can switch back to Church A', async ({
    page,
    browser,
  }, testInfo) => {
    const journey = loadMinistryRedemptionJourney({ testInfo });
    const { memberOnly: bruno } = journey;
    const churchA = journey.churchA.church;
    const churchB = journey.churchB.church;

    // Church B's admin invites Bruno Church-only (as Admin: no Ministry) from the Invitations page.
    await signInPersonaPage({ page, persona: journey.churchB.personas.admin });
    await page.goto('/invitations');
    await page
      .getByRole('button', { name: m.invitations_invite_open({}, PT) })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByLabel(m.invitations_invite_email_label({}, PT))
      .fill(bruno.email);
    await dialog
      .getByRole('radio', { name: m.invitations_invite_as_admin({}, PT) })
      .click();
    await dialog
      .getByRole('button', { name: m.invitations_invite_submit({}, PT) })
      .click();
    await expect(
      page.getByText(
        m.invitations_invite_sent_toast({ email: bruno.email }, PT),
      ),
    ).toBeVisible();
    const linkPath = await fetchEmailedJoiningPath({
      request: page.request,
      email: bruno.email,
    });

    const context = await browser.newContext({
      baseURL: requiredE2eUrl({ variable: 'PW_WEB_URL' }),
    });
    try {
      const brunoPage = await context.newPage();
      await brunoPage.goto(linkPath);
      await brunoPage
        .getByRole('link', { name: m.join_sign_in_to_accept({}, PT) })
        .click();
      await expect(brunoPage).toHaveURL(/\/login(\?.*)?$/);
      await signIn({ page: brunoPage, persona: bruno });
      await expect(brunoPage).toHaveURL(
        new RegExp(`${linkPath.replace(/\//g, '\\/')}\\/review$`),
      );
      await expect(
        brunoPage.getByRole('heading', {
          level: 1,
          name: m.church_invitation_review_title(
            { churchName: churchB.name },
            PT,
          ),
        }),
      ).toBeVisible();

      const [acceptResponse] = await Promise.all([
        brunoPage.waitForResponse((response) =>
          response.url().endsWith('/accept'),
        ),
        brunoPage
          .getByRole('button', { name: m.ministry_invitation_accept({}, PT) })
          .click(),
      ]);
      assertServedFromPinnedTarget({
        response: acceptResponse,
        step: 'accept Church-only invitation signed in',
      });
      expect(((await acceptResponse.json()) as { kind: string }).kind).toBe(
        'full-success',
      );
      await expect(brunoPage).toHaveURL(/:\d+\/(\?.*)?$/);
      expect(
        await fetchActiveChurchStatus({ request: brunoPage.request }),
      ).toMatchObject({ churchId: churchB.id });

      await brunoPage
        .getByTestId('sidebar')
        .getByRole('button', { name: m.nav_switch_church({}, PT) })
        .click();
      await brunoPage
        .locator(`[data-testid="select-church-option-${churchA.id}"]:visible`)
        .click();
      await expect
        .poll(
          async () =>
            (await fetchActiveChurchStatus({ request: brunoPage.request }))
              .churchId,
        )
        .toBe(churchA.id);
    } finally {
      await context.close();
    }
  });
});

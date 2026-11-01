import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { assertServedFromPinnedTarget } from '@/tests/fixtures/e2e-target';
import { loadFirstAdminOnboardingJourney } from '@/tests/fixtures/journeys/first-admin-onboarding';
import {
  churchInvitationIdOf,
  fetchActiveChurchStatus,
  fetchDebugVerificationCode,
  fetchJson,
} from '@/tests/fixtures/journeys/identity-actions';

// J0 → J1: a Church fresh from Platform Operator provisioning hands its first
// ChurchAdmin the printed link. That person reviews the plain Church
// Invitation (no Ministry), verifies the addressed mailbox with a code read
// from the capture sender, joins, and reaches Home with the Church active.
// Failure copy, rollback and throttling are proved below this seam.
const PT = { locale: 'pt-BR' } as const;

interface JoinOutcome {
  kind: string;
  volunteerId?: string | null;
}

interface ChurchOption {
  churchId: string;
}

interface ChurchOptionsResponse {
  churches: ChurchOption[];
}

test.describe('J0→J1 — the first ChurchAdmin joins a provisioned Church', () => {
  test('opens the printed link, verifies a code, joins and lands on Home with the Church active', async ({
    page,
  }, testInfo) => {
    const journey = loadFirstAdminOnboardingJourney({ testInfo });
    const churchInvitationId = churchInvitationIdOf({
      redemptionPath: journey.redemptionPath,
    });

    await page.goto(journey.redemptionPath);
    await expect(
      page.getByRole('heading', {
        name: m.join_title({ churchName: journey.church.name }, PT),
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        m.join_church_access(
          { accessLevel: m.join_church_access_admin({}, PT) },
          PT,
        ),
      ),
    ).toBeVisible();
    await expect(page.getByLabel(m.join_email_label({}, PT))).toHaveValue(
      journey.adminEmail,
    );

    await page.getByRole('button', { name: m.join_send_code({}, PT) }).click();
    await expect(page.getByLabel(m.join_code_label({}, PT))).toBeVisible();
    const code = await fetchDebugVerificationCode({
      request: page.request,
      churchInvitationId,
    });

    await page.getByLabel(m.join_code_label({}, PT)).fill(code);
    await page.getByLabel(m.join_name_label({}, PT)).fill('E2E First Admin');
    await page
      .getByLabel(m.join_password_label({}, PT))
      .fill('correct-horse-battery-staple');
    const [joinResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response
          .url()
          .endsWith(`/redemption/church/${churchInvitationId}/redeem`),
      ),
      page.getByRole('button', { name: m.join_submit({}, PT) }).click(),
    ]);
    assertServedFromPinnedTarget({
      response: joinResponse,
      step: 'join the first-admin invitation',
    });
    // A plain invitation needs no Ministry: no Volunteer is created.
    expect((await joinResponse.json()) as JoinOutcome).toEqual({
      kind: 'full-success',
      volunteerId: null,
    });

    await expect(page).toHaveURL(/:\d+\/(\?.*)?$/);
    const status = await fetchActiveChurchStatus({ request: page.request });
    expect(status.churchId).toBe(journey.church.id);
    const { churches } = await fetchJson<ChurchOptionsResponse>({
      request: page.request,
      path: '/api/v1/active-church/options',
    });
    expect(churches.map((church) => church.churchId)).toEqual([
      journey.church.id,
    ]);
  });
});

import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import { loadAdminCancelJourney } from '@/tests/fixtures/journeys/admin-cancel';
import {
  assignBuilderPath,
  assignPreparePath,
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const locale = { locale: 'pt-BR' } as const;

interface NotificationKinds {
  items: { kind: string }[];
}

test('J10 admin cancellation: impact, typed gate, N9 and N10, closed SwapRequest, nothing left for Send updates', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadAdminCancelJourney({ testInfo });
  const { personas } = journey;
  const ministryId = journey.ministries.worship.id;
  const cycleId = journey.cycle.id;
  const eventTitle = journey.event.title;
  await signInPersonaPage({ page, persona: personas.admin });
  const volunteerContext = await newPersonaContext({
    browser,
    persona: personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();
  const leaderContext = await newPersonaContext({
    browser,
    persona: personas.leader,
  });
  const leaderPage = await leaderContext.newPage();
  const kindsOf = async (who: typeof page) => {
    const response = await who.request.get(
      `${SERVER_URL}/api/v1/notifications`,
    );
    if (!response.ok()) return [];
    return ((await response.json()) as NotificationKinds).items.map(
      (item) => item.kind,
    );
  };
  const bellTitle = new RegExp(`^Cancelado: ${eventTitle}`);
  const expectBellNotice = async (who: typeof page, kind: string) => {
    await expect
      .poll(async () => (await kindsOf(who)).includes(kind), {
        timeout: 20_000,
      })
      .toBe(true);
    await who.goto('/dashboard');
    await who
      .getByRole('button', { name: m.notification_bell_label({}, locale) })
      .click();
    await expect(who.getByText(bellTitle).first()).toBeVisible();
  };

  const assignmentLink = volunteerPage.locator(
    `a[href="/my-schedule/${journey.assignmentId}"]`,
  );
  // Before: the Volunteer is scheduled and the leader sees the open swap.
  await volunteerPage.goto('/my-schedule');
  await expect(assignmentLink).toBeVisible();
  await leaderPage.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(leaderPage.getByTestId('swap-requests-link')).toBeVisible();

  // The admin previews the impact and passes the typed gate.
  await page.goto(`/cycles/${cycleId}/events/${journey.event.id}`);
  await page
    .getByRole('button', {
      name: m.event_cancel_action_label({ title: eventTitle }, locale),
    })
    .click();
  const dialog = page.getByTestId('event-cancel-dialog');
  const impact = dialog.getByTestId('event-cancel-impact');
  await expect(impact).toContainText(m.event_cancel_volunteers_one({}, locale));
  await expect(impact).toContainText(m.event_cancel_ministries_one({}, locale));
  await expect(impact).toContainText(
    m.event_cancel_swap_requests_one({}, locale),
  );
  const confirm = dialog.getByRole('button', {
    name: m.event_cancel_confirm({}, locale),
  });
  await expect(confirm).toBeDisabled();
  const word = m.cancellation_confirm_word({}, locale);
  await dialog
    .getByLabel(m.event_cancel_confirm_label({ word }, locale))
    .fill(word);
  await confirm.click();
  await expect(dialog.getByTestId('event-cancel-done')).toHaveText(
    m.event_cancel_done_one({}, locale),
  );

  // The Volunteer is told (N9) and the Assignment is gone, at once.
  await expectBellNotice(volunteerPage, 'event_cancelled');
  await volunteerPage.goto('/my-schedule');
  await expect(
    volunteerPage.getByText(m.my_schedule_empty({}, locale)),
  ).toBeVisible();
  await expect(assignmentLink).toHaveCount(0);

  // The leader is told (N10); the SwapRequest is closed without an answer.
  await expectBellNotice(leaderPage, 'event_changed');
  expect(await kindsOf(volunteerPage)).not.toContain('swap_request_answered');
  await leaderPage.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(leaderPage.getByTestId('swap-requests-link')).toHaveCount(0);

  // Send updates has no cancellation change left to tell.
  await leaderPage.goto(assignBuilderPath({ ministryId, cycleId }));
  await expect(leaderPage.getByTestId('cycle-builder')).toBeVisible();
  await expect(
    leaderPage.getByRole('button', {
      name: m.builder_send_updates({ count: 1 }, locale).split(' (')[0],
    }),
  ).toHaveCount(0);

  await volunteerContext.close();
  await leaderContext.close();
});

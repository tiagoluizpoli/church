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
import { fillTimeOfDayField } from '@/tests/scheduling/time-field.helpers';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const locale = { locale: 'pt-BR' } as const;
const NEW_END = '12:00';

interface NotificationKinds {
  items: { kind: string }[];
}

test('J11 admin edit: extend a sent Event and its block, keep the Assignment and its SwapRequest, tell the Volunteer on Send updates', async ({
  browser,
  page,
}, testInfo) => {
  // Same starting graph as J10: a sent Cycle, one future Event with its
  // Volunteer assigned, told, and an open SwapRequest.
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

  // The admin edits the sent Event from the Cycle view: preview, then confirm.
  await page.goto(`/app/cycles/${cycleId}`);
  await page
    .getByRole('button', {
      name: m.event_edit_preview_action_label({ title: eventTitle }, locale),
    })
    .click();
  const dialog = page.getByTestId('event-edit-preview');
  await fillTimeOfDayField({
    field: dialog.getByTestId('event-edit-end-time'),
    time: NEW_END,
  });
  await fillTimeOfDayField({
    field: dialog.getByTestId('event-edit-block-1-end-time'),
    time: NEW_END,
  });
  await dialog
    .getByRole('button', { name: m.event_edit_preview_run({}, locale) })
    .click();
  const previewResult = dialog.getByTestId('edit-preview-result');
  await expect(previewResult).toBeVisible();
  await expect(previewResult).toContainText(
    m.event_move_preview_no_clashes({}, locale),
  );
  await dialog
    .getByRole('button', { name: m.event_edit_confirm({}, locale) })
    .click();
  const result = dialog.getByTestId('edit-result');
  await expect(result).toContainText(m.event_move_withdrawn_none({}, locale));

  // The Assignment stays, on the new time, and its open SwapRequest is untouched.
  await volunteerPage.goto('/app/my-schedule');
  await expect(
    volunteerPage
      .getByRole('link', {
        name: new RegExp(`${eventTitle}.*09:00–${NEW_END}`),
      })
      .first(),
  ).toBeVisible();
  await leaderPage.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(leaderPage.getByTestId('swap-requests-link')).toBeVisible();

  // The leader's Send updates carries the new time to the Volunteer.
  await leaderPage.goto(assignBuilderPath({ ministryId, cycleId }));
  await leaderPage
    .getByRole('button', { name: m.builder_send_updates({ count: 1 }, locale) })
    .click();
  await expect(
    leaderPage.getByText(m.schedule_updates_sent({}, locale)),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const response = await volunteerPage.request.get(
          `${SERVER_URL}/api/v1/notifications`,
        );
        if (!response.ok()) return false;
        const { items } = (await response.json()) as NotificationKinds;
        return items.some(({ kind }) => kind === 'schedule_updated');
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await volunteerPage.goto('/app/dashboard');
  await volunteerPage
    .getByRole('button', { name: m.notification_bell_label({}, locale) })
    .click();
  await expect(
    volunteerPage
      .getByText(
        m.notification_schedule_updated_title(
          { ministryName: journey.ministries.worship.name },
          locale,
        ),
        { exact: true },
      )
      .first(),
  ).toBeVisible();

  await volunteerContext.close();
  await leaderContext.close();
});

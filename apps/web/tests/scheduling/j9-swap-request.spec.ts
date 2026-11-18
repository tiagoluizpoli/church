import { m } from '@church/i18n/messages';
import { expect, type Page, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  assignBuilderPath,
  assignPreparePath,
  newPersonaContext,
  requirementCellTestId,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadSwapRequestJourney } from '@/tests/fixtures/journeys/swap-request';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const locale = { locale: 'pt-BR' } as const;

interface OpenNotificationInput {
  page: Page;
  kind: string;
  title: string;
}

/** Waits for the outbox-delivered bell item, then opens it from the bell. */
async function openBellNotification({
  page,
  kind,
  title,
}: OpenNotificationInput): Promise<void> {
  await page.goto('/dashboard');
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `${SERVER_URL}/api/v1/notifications`,
        );
        if (!response.ok()) return false;
        const body = await response.json();
        return body.items.some((item: { kind: string }) => item.kind === kind);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.reload();
  await page
    .getByRole('button', { name: m.notification_bell_label({}, locale) })
    .click();
  await page.getByText(title, { exact: true }).click();
}

test('J9 swap request: raise, keep with a reply, raise again, cover through reassignment and Send updates', async ({
  browser,
  page,
}, testInfo) => {
  const journey = loadSwapRequestJourney({ testInfo });
  const { ministries, personas } = journey;
  const ministryId = ministries.worship.id;
  const cycleId = journey.cycle.id;
  await signInPersonaPage({ page, persona: personas.leader });
  const volunteerContext = await newPersonaContext({
    browser,
    persona: personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();
  const raise = async (note: string) => {
    await volunteerPage.goto(`/my-schedule/${journey.assignmentId}`);
    await volunteerPage
      .getByRole('button', { name: m.swap_ask({}, locale) })
      .click();
    await volunteerPage.getByLabel(m.swap_note_label({}, locale)).fill(note);
    await volunteerPage
      .getByRole('button', { name: m.swap_send({}, locale) })
      .click();
    await expect(
      volunteerPage.getByText(m.swap_requested_waiting({}, locale)),
    ).toBeVisible({ timeout: 20_000 });
  };
  const openCount = (count: number) =>
    page.getByTestId('swap-requests-link').filter({
      hasText: m.schedules_swap_requests_link({ count }, locale),
    });

  // Raise #1; the leader sees the count and follows N7 to the open sheet.
  await raise('Consulta médica');
  await page.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(openCount(1)).toBeVisible();
  await openBellNotification({
    page,
    kind: 'swap_request',
    title: m.notification_swap_request_title(
      { volunteerName: personas.volunteer.name },
      locale,
    ),
  });
  await page
    .getByRole('link', {
      name: m.notification_swap_request_action({}, locale),
    })
    .or(
      page.getByRole('button', {
        name: m.notification_swap_request_action({}, locale),
      }),
    )
    .click();
  const sheet = page.getByTestId('swap-request-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Consulta médica');

  // Keep them on, with a reply: the sheet closes and the indicator clears.
  const reply = 'Preciso de você nesse culto';
  await page.getByLabel(m.swap_board_reply_label({}, locale)).fill(reply);
  await page
    .getByRole('button', { name: m.swap_board_keep({}, locale) })
    .click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('swap-request-warning')).toHaveCount(0);
  await page.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(page.getByTestId('swap-requests-link')).toHaveCount(0);

  // N8 leads the Volunteer to the kept Assignment, with the reply.
  await openBellNotification({
    page: volunteerPage,
    kind: 'swap_request_answered',
    title: m.notification_swap_request_answered_title({}, locale),
  });
  await volunteerPage
    .getByRole('dialog')
    .getByRole('link', {
      name: m.notification_swap_request_answered_action({}, locale),
    })
    .or(
      volunteerPage.getByRole('dialog').getByRole('button', {
        name: m.notification_swap_request_answered_action({}, locale),
      }),
    )
    .click();
  await expect(volunteerPage).toHaveURL(
    new RegExp(`/my-schedule/${journey.assignmentId}`),
  );
  await expect(volunteerPage.getByText(m.swap_kept({}, locale))).toBeVisible();
  await expect(
    volunteerPage.getByText(m.swap_kept_reply({ reply }, locale)),
  ).toBeVisible();

  // Raise again without a cooldown; the leader covers through reassignment.
  await raise('Imprevisto');
  await page.goto(assignBuilderPath({ ministryId, cycleId }));
  await page.getByTestId('swap-request-warning').click();
  await expect(sheet).toBeVisible();
  await page
    .getByRole('button', { name: m.swap_board_cover({}, locale) })
    .click();
  await expect(sheet).toBeHidden();
  // Opening Cover alone closes nothing.
  await expect(page.getByTestId('swap-request-warning')).toBeVisible();
  const picker = page.getByTestId('assignment-picker');
  await picker.getByRole('textbox').fill(personas.replacement.name);
  await picker
    .getByTestId('picker-option')
    .filter({ hasText: personas.replacement.name })
    .click();
  await expect(
    page
      .getByTestId(
        requirementCellTestId({ requirementId: journey.requirementId }),
      )
      .getByTestId('assignment-chip'),
  ).toContainText(personas.replacement.name);
  await expect(page.getByTestId('swap-request-warning')).toHaveCount(0);
  await page
    .getByRole('button', { name: m.builder_send_updates({ count: 2 }, locale) })
    .click();
  await expect(
    page.getByText(m.schedule_updates_sent({}, locale)),
  ).toBeVisible();
  await page.goto(assignPreparePath({ ministryId, cycleId }));
  await expect(page.getByTestId('swap-requests-link')).toHaveCount(0);

  // N6 reaches the Volunteer with the covered tag.
  await openBellNotification({
    page: volunteerPage,
    kind: 'schedule_updated',
    title: m.notification_schedule_updated_title(
      { ministryName: ministries.worship.name },
      locale,
    ),
  });
  await expect(volunteerPage.getByRole('dialog')).toContainText(
    m.notification_schedule_updated_covered({}, locale).trim(),
  );
  await volunteerContext.close();
});

import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  assignPreparePath,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadLeaderPrepareJourney } from '@/tests/fixtures/journeys/leader-prepare';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const CYCLE_NAME = 'US2 Prepare';

interface IdResponse {
  id: string;
}

interface TemplateBsendResponse {
  id: string;
}

interface TemplateResponse extends IdResponse {
  blocks: TemplateBsendResponse[];
}

interface ParticipationSummaryResponse {
  id: string;
}

interface EventTimeBlockSummaryResponse {
  id: string;
  label?: string;
}

interface EventTimeBlockEntryResponse {
  eventTimeBlock: EventTimeBlockSummaryResponse;
}

interface ParticipationEventResponse {
  participation: ParticipationSummaryResponse;
  eventTimeBlocks: EventTimeBlockEntryResponse[];
}

interface ParticipationResponse {
  events: ParticipationEventResponse[];
}

test('leader prepares one Time block and sees its saved Schedule summary', async ({
  page,
}, testInfo) => {
  // The journey owns its Church, Ministry and usual setup: no other
  // spec can replace the usual setup between the PUT and apply-templates.
  const journey = loadLeaderPrepareJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  const ministryId = journey.ministries.worship.id;
  const roleId = journey.ministries.worship.roles.usher.id;
  const sectorId = journey.ministries.worship.sectors.stage.id;

  const defaultDirectionResponse = await page.request.patch(
    `${SERVER_URL}/api/v1/admin/ministries/${ministryId}/default-direction`,
    {
      data: { defaultDirection: 'all_out' },
    },
  );
  expect(defaultDirectionResponse.ok()).toBeTruthy();

  const cycleResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles`,
    {
      data: {
        name: CYCLE_NAME,
        startDate: journey.cycleWindow.startDate,
        endDate: journey.cycleWindow.endDate,
      },
    },
  );
  expect(cycleResponse.ok()).toBeTruthy();
  const cycleBody = (await cycleResponse.json()) as IdResponse;

  const templateResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/event-templates`,
    {
      data: {
        name: 'US2 Sunday Template',
        weekday: 0,
        blocks: [
          { label: 'Welcome', startTime: '09:00', endTime: '09:30' },
          { label: 'Message', startTime: '09:30', endTime: '10:30' },
          { label: 'Prayer', startTime: '10:30', endTime: '11:00' },
        ],
      },
    },
  );
  expect(templateResponse.ok()).toBeTruthy();
  const templateBody = (await templateResponse.json()) as TemplateResponse;

  const usualSetup = [
    { block: templateBody.blocks[0], serves: true },
    { block: templateBody.blocks[1], serves: true },
    { block: templateBody.blocks[2], serves: false },
  ];
  for (const { block, serves } of usualSetup) {
    const usualSetupResponse = await page.request.put(
      `${SERVER_URL}/api/v1/ministries/${ministryId}/usual-setup/${block?.id}`,
      {
        data: {
          serves,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: serves
            ? [{ shiftIndex: 0, sectorId, roleId, peopleNeeded: 1 }]
            : [],
        },
      },
    );
    expect(usualSetupResponse.ok()).toBeTruthy();
  }

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycleBody.id}/apply-templates`,
    {
      data: { templateIds: [templateBody.id] },
    },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const sendResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycleBody.id}/send`,
  );
  expect(sendResponse.ok()).toBeTruthy();

  await page.goto('/schedules');
  await expect(
    page.getByRole('heading', {
      name: m.schedules_title({}, { locale: 'pt-BR' }),
    }),
  ).toBeVisible();
  const schedulePath = assignPreparePath({ ministryId, cycleId: cycleBody.id });
  await page.locator(`a[href="${schedulePath}"]`).click();
  await expect(page).toHaveURL(schedulePath);

  // Discover the generated Time block ids through the same participation
  // read the page uses, without depending on calendar row order.
  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/prepare/cycles/${cycleBody.id}/participation`,
    { params: { ministryId } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participationBody =
    (await participationResponse.json()) as ParticipationResponse;
  const firstEvent = participationBody.events[0];
  if (!firstEvent) throw new Error('No events found for cycle participation');
  const welcomeEventTimeBlock = firstEvent.eventTimeBlocks.find(
    (s) => s.eventTimeBlock.label === 'Welcome',
  );
  const messageEventTimeBlock = firstEvent.eventTimeBlocks.find(
    (s) => s.eventTimeBlock.label === 'Message',
  );
  const prayerEventTimeBlock = firstEvent.eventTimeBlocks.find(
    (s) => s.eventTimeBlock.label === 'Prayer',
  );
  if (
    !welcomeEventTimeBlock ||
    !messageEventTimeBlock ||
    !prayerEventTimeBlock
  ) {
    throw new Error('Expected Welcome/Message/Prayer time blocks not found');
  }

  // Rows have stable DOM ids, also used by the Save return anchor.
  const welcomeId = welcomeEventTimeBlock.eventTimeBlock.id;
  const welcomeRow = page.locator(`#event-time-block-${welcomeId}`);
  const messageRow = page.locator(
    `#event-time-block-${messageEventTimeBlock.eventTimeBlock.id}`,
  );
  const prayerRow = page.locator(
    `#event-time-block-${prayerEventTimeBlock.eventTimeBlock.id}`,
  );
  await expect(welcomeRow).toBeVisible();
  const initialSummary = m.prepare_row_summary(
    {
      shifts: m.usual_setup_shift_count_one({}, { locale: 'pt-BR' }),
      people: m.prepare_people_count_one({}, { locale: 'pt-BR' }),
    },
    { locale: 'pt-BR' },
  );
  await expect(welcomeRow).toContainText(initialSummary);
  await expect(messageRow).toContainText(initialSummary);
  await expect(prayerRow).toContainText(
    m.prepare_not_served({}, { locale: 'pt-BR' }),
  );

  await welcomeRow.click();
  const blockPath = `${schedulePath}/slots/${welcomeId}`;
  await expect(page).toHaveURL(blockPath);
  // Desktop opens the editor in a non-modal panel beside the usable list.
  const panel = page.getByTestId('prepare-block-panel');
  await expect(panel.getByRole('heading', { name: /Welcome$/ })).toBeFocused();
  await expect(welcomeRow).toHaveAttribute('aria-current', 'page');
  await expect(messageRow).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Direct navigation must load the same saved block without list-page state.
  await page.reload();
  await expect(
    page.getByRole('checkbox', {
      name: m.usual_setup_serves_label({}, { locale: 'pt-BR' }),
    }),
  ).toBeChecked();
  await page
    .getByRole('radio', {
      name: m.shift_split_mode_equal({}, { locale: 'pt-BR' }),
    })
    .check();
  await page
    .getByLabel(m.shift_split_equal_count({}, { locale: 'pt-BR' }))
    .fill('2');

  const { roles, sectors } = journey.ministries.worship;
  const firstHeadcount = page.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label(
      {
        role: roles.usher.name,
        sector: sectors.stage.name,
        shift: m.usual_setup_shift_label({ number: 1 }, { locale: 'pt-BR' }),
      },
      { locale: 'pt-BR' },
    ),
    exact: true,
  });
  const secondHeadcount = page.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label(
      {
        role: roles.usher.name,
        sector: sectors.stage.name,
        shift: m.usual_setup_shift_label({ number: 2 }, { locale: 'pt-BR' }),
      },
      { locale: 'pt-BR' },
    ),
    exact: true,
  });
  await firstHeadcount.fill('2');
  await secondHeadcount.fill('1');
  await page
    .getByRole('button', {
      name: m.usual_setup_save({}, { locale: 'pt-BR' }),
      exact: true,
    })
    .click();

  await expect(page).toHaveURL(`${schedulePath}#event-time-block-${welcomeId}`);
  const savedSummary = m.prepare_row_summary(
    {
      shifts: m.usual_setup_shift_count_other(
        { count: 2 },
        { locale: 'pt-BR' },
      ),
      people: m.prepare_people_count_other({ count: 3 }, { locale: 'pt-BR' }),
    },
    { locale: 'pt-BR' },
  );
  await expect(welcomeRow).toContainText(savedSummary);
  await expect(welcomeRow).toBeInViewport();
  // Save closes the panel and returns focus to the block's row.
  await expect(panel).toHaveCount(0);
  await expect(welcomeRow).toBeFocused();
  // A reload proves the summary comes from the persisted slot save.
  await page.reload();
  await expect(welcomeRow).toContainText(savedSummary);
  await expect(messageRow).toContainText(initialSummary);
  await expect(prayerRow).toContainText(
    m.prepare_not_served({}, { locale: 'pt-BR' }),
  );
  await welcomeRow.click();
  await expect(firstHeadcount).toHaveValue('2');
  await expect(secondHeadcount).toHaveValue('1');
  // An untouched block switches in place to another block's editor.
  await messageRow.click();
  await expect(panel.getByRole('heading', { name: /Message$/ })).toBeFocused();
  await expect(panel.getByRole('heading', { name: /Welcome$/ })).toHaveCount(0);
  await expect(messageRow).toHaveAttribute('aria-current', 'page');

  // Narrow screens keep the separate editor and return to the list row.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(messageRow).toBeHidden();
  await page
    .getByRole('button', {
      name: m.usual_setup_cancel({}, { locale: 'pt-BR' }),
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(
    `${schedulePath}#event-time-block-${messageEventTimeBlock.eventTimeBlock.id}`,
  );
  await expect(messageRow).toBeInViewport();
  await expect(messageRow).toBeFocused();
});

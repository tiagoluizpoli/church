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
  state: string;
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

test('leader prepares participation, splits shifts, sets headcounts, and requests availability', async ({
  page,
}, testInfo) => {
  // The journey owns its Church, Ministry and usual setup: no other
  // spec can replace the usual setup between the PUT and apply-templates.
  const journey = loadLeaderPrepareJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  const ministryId = journey.ministries.worship.id;
  const roleId = journey.ministries.worship.roles.usher.id;

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
          { label: 'Welcome', startTime: '09:00', endTime: '09:30', order: 0 },
          { label: 'Message', startTime: '09:30', endTime: '10:30', order: 1 },
          { label: 'Prayer', startTime: '10:30', endTime: '11:00', order: 2 },
        ],
      },
    },
  );
  expect(templateResponse.ok()).toBeTruthy();
  const templateBody = (await templateResponse.json()) as TemplateResponse;

  const usualSetupResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${ministryId}/usual-setup`,
    {
      data: {
        entries: [
          {
            sourceTemplateTimeBlockId: templateBody.blocks[0]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, peopleNeeded: 1 }],
          },
          {
            sourceTemplateTimeBlockId: templateBody.blocks[1]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, peopleNeeded: 1 }],
          },
          {
            sourceTemplateTimeBlockId: templateBody.blocks[2]?.id,
            serves: false,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [],
          },
        ],
      },
    },
  );
  expect(usualSetupResponse.ok()).toBeTruthy();

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

  await page.goto(assignPreparePath({ ministryId, cycleId: cycleBody.id }));

  // The workspace groups time blocks by day and keys every control off real
  // time block/participation ids, not event/shift array positions — fetch the
  // same data the page renders from so locators match real ids instead of
  // guessing at row order or display text.
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

  const welcomeRow = page.getByTestId(
    `prepare-event-time-block-row-${welcomeEventTimeBlock.eventTimeBlock.id}`,
  );
  const messageRow = page.getByTestId(
    `prepare-event-time-block-row-${messageEventTimeBlock.eventTimeBlock.id}`,
  );
  const prayerRow = page.getByTestId(
    `prepare-event-time-block-row-${prayerEventTimeBlock.eventTimeBlock.id}`,
  );

  await expect(
    welcomeRow.getByTestId(
      `serving-toggle-${welcomeEventTimeBlock.eventTimeBlock.id}`,
    ),
  ).toBeChecked();
  await expect(
    messageRow.getByTestId(
      `serving-toggle-${messageEventTimeBlock.eventTimeBlock.id}`,
    ),
  ).toBeChecked();
  await expect(
    prayerRow.getByTestId(
      `serving-toggle-${prayerEventTimeBlock.eventTimeBlock.id}`,
    ),
  ).not.toBeChecked();

  await welcomeRow
    .getByTestId(
      `toggle-event-time-block-expand-${welcomeEventTimeBlock.eventTimeBlock.id}`,
    )
    .click();
  const welcomeEditor = welcomeRow.getByTestId(
    `prepare-event-time-block-editor-${welcomeEventTimeBlock.eventTimeBlock.id}`,
  );
  // `equal-split-count`/`shift-mode-select` are keyed by a constant local
  // index (one editor per row, always index 0), not the time block id — scoping
  // to `welcomeEditor` disambiguates them from every other expanded row's
  // editor on the page. A time block starts in "single shift" mode regardless of
  // the usual setup's suggested split — the leader must explicitly
  // switch to "Equal split" before the count field appears.
  await welcomeEditor.getByTestId('shift-mode-select-0').click();
  await page.getByRole('option', { name: 'Equal split' }).click();
  await welcomeEditor.getByTestId('equal-split-count-0').fill('2');
  await welcomeRow
    .getByTestId(`save-split-button-${welcomeEventTimeBlock.eventTimeBlock.id}`)
    .click();

  const shiftRows = welcomeEditor.locator(
    '[data-testid^="participation-shift-row-"]',
  );
  await expect(shiftRows).toHaveCount(2);

  // The role catalog can list more roles than the usual setup set a
  // headcount for — the editor requires a value for every listed role
  // before "Save people needed" enables, so fill all of them per shift.
  const firstShiftInputs = shiftRows
    .nth(0)
    .locator('[data-testid^="headcount-input-"]');
  const secondShiftInputs = shiftRows
    .nth(1)
    .locator('[data-testid^="headcount-input-"]');
  const firstShiftInputCount = await firstShiftInputs.count();
  for (let i = 0; i < firstShiftInputCount; i++) {
    await firstShiftInputs.nth(i).fill('2');
  }
  const secondShiftInputCount = await secondShiftInputs.count();
  for (let i = 0; i < secondShiftInputCount; i++) {
    await secondShiftInputs.nth(i).fill('1');
  }
  await welcomeRow
    .getByTestId(
      `save-headcounts-button-${welcomeEventTimeBlock.eventTimeBlock.id}`,
    )
    .click();

  await page.getByTestId('save-and-ask-availability-button').click();
  await page.getByTestId('prepare-send-confirm').click();

  await expect(welcomeRow.getByTestId('participation-state-badge')).toHaveText(
    'Availability requested',
  );
});

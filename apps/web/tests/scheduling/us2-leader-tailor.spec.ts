import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import { loadLeaderTailoringJourney } from '../fixtures/journeys/leader-tailoring';
import {
  rosteringTailoringPath,
  signInPersonaPage,
} from '../fixtures/journeys/rostering-church';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const CYCLE_NAME = 'US2 Tailoring';

interface IdResponse {
  id: string;
}

interface TemplateBlockResponse {
  id: string;
}

interface TemplateResponse extends IdResponse {
  blocks: TemplateBlockResponse[];
}

interface ParticipationSummaryResponse {
  id: string;
  state: string;
}

interface SlotSummaryResponse {
  id: string;
  label?: string;
}

interface SlotEntryResponse {
  slot: SlotSummaryResponse;
}

interface ParticipationEventResponse {
  participation: ParticipationSummaryResponse;
  slots: SlotEntryResponse[];
}

interface ParticipationResponse {
  events: ParticipationEventResponse[];
}

test('leader tailors participation, splits shifts, sets headcounts, and fires availability', async ({
  page,
}, testInfo) => {
  // The journey owns its Church, Ministry and serving profile: no other
  // spec can replace the profile between the PUT and apply-templates.
  const journey = loadLeaderTailoringJourney({ testInfo });
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
    `${SERVER_URL}/api/v1/admin/planning-cycles`,
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

  const servingProfileResponse = await page.request.put(
    `${SERVER_URL}/api/v1/admin/ministries/${ministryId}/serving-profile`,
    {
      data: {
        entries: [
          {
            sourceTemplateBlockId: templateBody.blocks[0]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, count: 1 }],
          },
          {
            sourceTemplateBlockId: templateBody.blocks[1]?.id,
            serves: true,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [{ roleId, count: 1 }],
          },
          {
            sourceTemplateBlockId: templateBody.blocks[2]?.id,
            serves: false,
            shiftSplit: { kind: 'equal', count: 1 },
            headcounts: [],
          },
        ],
      },
    },
  );
  expect(servingProfileResponse.ok()).toBeTruthy();

  const applyResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycleBody.id}/apply-templates`,
    {
      data: { templateIds: [templateBody.id] },
    },
  );
  expect(applyResponse.ok()).toBeTruthy();

  const lockResponse = await page.request.post(
    `${SERVER_URL}/api/v1/admin/planning-cycles/${cycleBody.id}/lock`,
  );
  expect(lockResponse.ok()).toBeTruthy();

  await page.goto(
    rosteringTailoringPath({ ministryId, cycleId: cycleBody.id }),
  );

  // The workspace groups slots by day and keys every control off real
  // slot/participation ids, not event/shift array positions — fetch the
  // same data the page renders from so locators match real ids instead of
  // guessing at row order or display text.
  const participationResponse = await page.request.get(
    `${SERVER_URL}/api/v1/tailoring/cycles/${cycleBody.id}/participation`,
    { params: { ministryId } },
  );
  expect(participationResponse.ok()).toBeTruthy();
  const participationBody =
    (await participationResponse.json()) as ParticipationResponse;
  const firstEvent = participationBody.events[0];
  if (!firstEvent) throw new Error('No events found for cycle participation');
  const welcomeSlot = firstEvent.slots.find((s) => s.slot.label === 'Welcome');
  const messageSlot = firstEvent.slots.find((s) => s.slot.label === 'Message');
  const prayerSlot = firstEvent.slots.find((s) => s.slot.label === 'Prayer');
  if (!welcomeSlot || !messageSlot || !prayerSlot) {
    throw new Error('Expected Welcome/Message/Prayer slots not found');
  }

  const welcomeRow = page.getByTestId(
    `tailoring-slot-row-${welcomeSlot.slot.id}`,
  );
  const messageRow = page.getByTestId(
    `tailoring-slot-row-${messageSlot.slot.id}`,
  );
  const prayerRow = page.getByTestId(
    `tailoring-slot-row-${prayerSlot.slot.id}`,
  );

  await expect(
    welcomeRow.getByTestId(`serving-toggle-${welcomeSlot.slot.id}`),
  ).toBeChecked();
  await expect(
    messageRow.getByTestId(`serving-toggle-${messageSlot.slot.id}`),
  ).toBeChecked();
  await expect(
    prayerRow.getByTestId(`serving-toggle-${prayerSlot.slot.id}`),
  ).not.toBeChecked();

  await welcomeRow
    .getByTestId(`toggle-slot-expand-${welcomeSlot.slot.id}`)
    .click();
  const welcomeEditor = welcomeRow.getByTestId(
    `tailoring-slot-editor-${welcomeSlot.slot.id}`,
  );
  // `equal-split-count`/`shift-mode-select` are keyed by a constant local
  // index (one editor per row, always index 0), not the slot id — scoping
  // to `welcomeEditor` disambiguates them from every other expanded row's
  // editor on the page. A slot starts in "single shift" mode regardless of
  // the serving profile's suggested split — the leader must explicitly
  // switch to "Equal split" before the count field appears.
  await welcomeEditor.getByTestId('shift-mode-select-0').click();
  await page.getByRole('option', { name: 'Equal split' }).click();
  await welcomeEditor.getByTestId('equal-split-count-0').fill('2');
  await welcomeRow
    .getByTestId(`save-split-button-${welcomeSlot.slot.id}`)
    .click();

  const shiftRows = welcomeEditor.locator(
    '[data-testid^="participation-shift-row-"]',
  );
  await expect(shiftRows).toHaveCount(2);

  // The role catalog can list more roles than the serving profile set a
  // headcount for — the editor requires a value for every listed role
  // before "Save headcounts" enables, so fill all of them per shift.
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
    .getByTestId(`save-headcounts-button-${welcomeSlot.slot.id}`)
    .click();

  await page.getByTestId('save-and-fire-availability-button').click();
  await page.getByTestId('tailoring-send-confirm').click();

  await expect(welcomeRow.getByTestId('participation-state-badge')).toHaveText(
    'Availability requested',
  );
});

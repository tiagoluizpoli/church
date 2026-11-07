import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { fillDatePickerField } from './date-picker.helpers';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  assignPreparePath,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadLeaderPrepareJourney } from '@/tests/fixtures/journeys/leader-prepare';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const LOCALE = { locale: 'pt-BR' } as const;
interface IdResponse {
  id: string;
}
interface TemplateResponse extends IdResponse {
  blocks: IdResponse[];
}
interface ParticipationResponse {
  events: {
    eventTimeBlocks: { eventTimeBlock: { id: string; label?: string } }[];
  }[];
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`J6: leader prepares, asks with a Deadline and reminds pending Volunteers (${viewport.name})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
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
          name: 'J6 Availability',
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
          name: 'J6 Sunday Template',
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
      { block: templateBody.blocks[1], serves: false },
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

    const schedulePath = assignPreparePath({
      ministryId,
      cycleId: cycleBody.id,
    });
    await page.goto(schedulePath);
    const participationResponse = await page.request.get(
      `${SERVER_URL}/api/v1/prepare/cycles/${cycleBody.id}/participation`,
      { params: { ministryId } },
    );
    expect(participationResponse.ok()).toBeTruthy();
    const participation =
      (await participationResponse.json()) as ParticipationResponse;
    const block = participation.events[0]?.eventTimeBlocks.find(
      ({ eventTimeBlock }) => eventTimeBlock.label === 'Welcome',
    );
    if (!block) throw new Error('Expected a Welcome Time block');
    const row = page.locator(`#event-time-block-${block.eventTimeBlock.id}`);
    await row.click();
    await page
      .getByRole('radio', { name: m.shift_split_mode_equal({}, LOCALE) })
      .check();
    await page.getByLabel(m.shift_split_equal_count({}, LOCALE)).fill('2');
    for (const number of [1, 2]) {
      await page
        .getByRole('spinbutton', {
          name: m.headcount_grid_cell_label(
            {
              role: journey.ministries.worship.roles.usher.name,
              sector: journey.ministries.worship.sectors.stage.name,
              shift: m.usual_setup_shift_label({ number }, LOCALE),
            },
            LOCALE,
          ),
          exact: true,
        })
        .fill('1');
    }
    await page
      .getByRole('button', {
        name: m.usual_setup_save({}, LOCALE),
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `${schedulePath}#event-time-block-${block.eventTimeBlock.id}`,
    );
    await expect(row).toContainText(
      m.prepare_row_summary(
        {
          shifts: m.usual_setup_shift_count_other({ count: 2 }, LOCALE),
          people: m.prepare_people_count_other({ count: 2 }, LOCALE),
        },
        LOCALE,
      ),
    );

    await page
      .getByRole('button', { name: m.prepare_ask({}, LOCALE), exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: m.prepare_ask({}, LOCALE),
    });
    await expect(dialog).toContainText(
      m.prepare_ask_counts(
        {
          volunteers: m.prepare_ask_volunteers_other({ count: 2 }, LOCALE),
          shifts: m.prepare_ask_shifts_other({ count: 5 }, LOCALE),
          events: m.prepare_ask_events_other({ count: 4 }, LOCALE),
        },
        LOCALE,
      ),
    );
    const answerBy = journey.cycleWindow.startDate;
    await fillDatePickerField({
      page,
      trigger: dialog.getByTestId('prepare-ask-deadline'),
      date: answerBy,
    });
    await page.screenshot({
      path: testInfo.outputPath(`ask-${viewport.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
    await dialog
      .getByRole('button', { name: m.prepare_ask({}, LOCALE), exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const answers = page.getByTestId('availability-status-list');
    await expect(answers).toContainText(
      m.answers_count({ confirmed: 0, asked: 2 }, LOCALE),
    );
    const pending = answers.getByRole('list', {
      name: m.answers_pending({}, LOCALE),
    });
    await expect(pending.getByRole('listitem')).toHaveCount(2);
    await expect(pending).toContainText(journey.pool.ana.name);
    await expect(pending).toContainText(journey.pool.bruno.name);
    await expect(answers.locator('time')).toHaveAttribute('datetime', answerBy);
    await page
      .getByText(m.prepare_ask_sent({}, LOCALE), { exact: true })
      .waitFor({ state: 'hidden' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`answers-${viewport.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
    await answers
      .getByRole('button', {
        name: m.answers_remind({ count: 2 }, LOCALE),
        exact: true,
      })
      .click();
    const cooldown = answers.getByRole('button', {
      name: new RegExp(
        m.answers_remind_cooldown({ time: '\\d{2}:\\d{2}' }, LOCALE),
      ),
    });
    await expect(cooldown).toBeDisabled();
    // Reload proves both the Deadline and cooldown came from the server.
    await page.reload();
    await expect(cooldown).toBeDisabled();
    await expect(pending.getByRole('listitem')).toHaveCount(2);
    await expect(answers.locator('time')).toHaveAttribute('datetime', answerBy);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`cooldown-${viewport.name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  });
}

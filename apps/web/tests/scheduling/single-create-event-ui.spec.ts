import { m } from '@church/i18n/messages';
import { expect, type Page, test } from '@playwright/test';
import { createCycleViaApi } from './cycle-api.helpers';
import { addEventOnNestedPage } from './event-create.helpers';
import { dayOfMonth, planningMonth } from './planning-month.helpers';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import {
  loadPlanningAdminJourney,
  type PlanningAdminJourney,
} from '@/tests/fixtures/journeys/planning-admin';

const LOCALE = { locale: 'pt-BR' } as const;

/** Mirrors `formatDayOf` (apps/web/src/shared/utils/church-time.ts), which
 * every event display renders through — assertions against
 * `planning-events-list` must match its fixed `dd/MM/yyyy` output, not the
 * `YYYY-MM-DD` the day was picked with. */
function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(day)}/${pad(month)}/${year}`;
}

interface CreateOpenCycleParams {
  page: Page;
  journey: PlanningAdminJourney;
  name: string;
}

/** Setup only (this spec asserts the create-event UI, not cycle creation):
 * creates the journey's cycle through the API and opens it. */
async function createOpenCycle({
  page,
  journey,
  name,
}: CreateOpenCycleParams): Promise<string> {
  const { startDate, endDate } = planningMonth({ anchor: journey.anchor });
  const cycle = await createCycleViaApi({
    page,
    name,
    startDate,
    endDate,
  });
  await page.goto(`/cycles/${cycle.id}`);
  await expect(
    page.getByRole('link', { name: m.cycles_add_event_button({}, LOCALE) }),
  ).toBeVisible();
  return cycle.id;
}

test('a Draft Cycle has exactly one create-Event entry: its nested New Event page', async ({
  page,
}, testInfo) => {
  const journey = loadPlanningAdminJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });

  const cycleId = await createOpenCycle({
    page,
    journey,
    name: 'Single create-event UI check',
  });
  await expect(
    page.getByRole('link', { name: m.cycles_add_event_button({}, LOCALE) }),
  ).toHaveCount(1);
  await page
    .getByRole('link', { name: m.cycles_add_event_button({}, LOCALE) })
    .click();

  await expect(page).toHaveURL(`/cycles/${cycleId}/events/new`);
  await expect(
    page.getByLabel(m.event_editor_title_label({}, LOCALE)),
  ).toBeVisible();
  await expect(page.getByTestId('event-start-time')).toBeVisible();
  await expect(page.getByTestId('event-end-time')).toBeVisible();
  await expect(page.getByTestId('event-time-block-row')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page
    .getByRole('link', { name: m.event_editor_cancel({}, LOCALE) })
    .click();
  await expect(page).toHaveURL(`/cycles/${cycleId}`);
});

test.describe('the New Event page stores church-local Instants (#149)', () => {
  // churchA (this fixture's church) is America/Sao_Paulo (UTC-3); a browser
  // far ahead of it (UTC+13) would show the wrong calendar day if the page
  // ever read days in the browser's own zone.
  test.use({ timezoneId: 'Pacific/Auckland' });

  test('the saved Event appears on the picked CalendarDay in the Church Timezone', async ({
    page,
  }, testInfo) => {
    const journey = loadPlanningAdminJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.admin });
    const pickedDate = dayOfMonth({
      monthStart: planningMonth({ anchor: journey.anchor }).startDate,
      dayOfMonth: 15,
    });

    await createOpenCycle({
      page,
      journey,
      name: 'Church TZ boundary check',
    });

    const title = 'Church TZ event';
    await addEventOnNestedPage({ page, title, startDate: pickedDate });

    await expect(page.getByTestId('planning-events-list')).toContainText(title);
    await expect(page.getByTestId('planning-events-list')).toContainText(
      toDisplayDate(pickedDate),
    );
  });
});

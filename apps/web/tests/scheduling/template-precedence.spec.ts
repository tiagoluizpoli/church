import { m } from '@church/i18n/messages';
import {
  enumerateCalendarDays,
  formatCalendarDay,
  parseCalendarDay,
  weekdayIndex,
} from '@church/time';
import { expect, test } from '@playwright/test';
import { fillDatePickerField } from './date-picker.helpers';
import { planningMonth } from './planning-month.helpers';
import { fillTimeOfDayField } from './time-field.helpers';
import { signInPersonaPage } from '@/tests/fixtures/journeys/assign-church';
import { loadPlanningAdminJourney } from '@/tests/fixtures/journeys/planning-admin';

const PT = { locale: 'pt-BR' } as const;

test.use({ viewport: { width: 767, height: 1200 } });

// #1027 / #1002: a 1st-Sunday template colliding with the weekly Sunday one.
// "Este vence" is stored on save; Apply then generates the 1st Sunday from the
// monthly template alone. Collision detection, expansion and the precedence
// rules themselves are proved at the domain and HTTP seams.
test('a ChurchAdmin lets a 1st-Sunday template win over the weekly Sunday one and Apply generates the 1st Sunday from it only', async ({
  page,
}, testInfo) => {
  const journey = loadPlanningAdminJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.admin });
  const window = planningMonth({ anchor: journey.anchor });
  const cycleName = `Precedence ${window.startDate.slice(0, 7)}`;
  const monthlyName = `Santa Ceia ${cycleName}`;
  const sundays = enumerateCalendarDays({
    start: parseCalendarDay({ value: window.startDate }),
    end: parseCalendarDay({ value: window.endDate }),
  }).filter((day) => weekdayIndex({ day }) === 0);
  const [firstSunday] = sundays;
  if (!firstSunday) throw new Error('Expected a Sunday in the Cycle');

  // The weekly Sunday template runs 09:00-11:00 in three blocks; this one
  // covers all of it, so on the 1st Sunday the weekly Event has nothing left.
  // The deep link opens the create dialog over the list; the collision
  // confirmation below stacks over it.
  await page.goto('/app/event-templates/new');
  await expect(page.getByTestId('template-create-dialog')).toBeVisible();
  await page.getByTestId('template-name-input').fill(monthlyName);
  await page.getByTestId('template-recurrence-kind').click();
  await page.getByTestId('template-recurrence-kind-monthly').click();
  const block = page.getByTestId('template-time-block-row').first();
  await block.getByTestId('template-time-block-label-input').fill('Santa Ceia');
  await fillTimeOfDayField({
    field: block.getByTestId('template-time-block-start-time-input'),
    time: '09:00',
  });
  await fillTimeOfDayField({
    field: block.getByTestId('template-time-block-end-time-input'),
    time: '11:00',
  });
  await page.getByTestId('create-template-button').click();

  const collision = page.getByTestId('template-collision-dialog');
  await expect(collision).toBeVisible();
  const pair = collision
    .getByTestId('template-collision-pair')
    .filter({ hasText: journey.sundayTemplate.name });
  await pair
    .getByRole('radio', {
      name: m.event_templates_precedence_this_wins({}, PT),
    })
    .check();
  await collision.getByTestId('confirm-template-collision-button').click();
  await expect(page).toHaveURL(/\/event-templates$/);
  await expect(page.getByTestId('template-create-dialog')).toBeHidden();

  await page.goto('/app/cycles');
  await page.getByTestId('open-create-cycle-dialog-button').click();
  const createCycle = page.getByRole('dialog', {
    name: m.cycles_form_title_new({}, PT),
  });
  await createCycle.getByTestId('cycle-name-input').fill(cycleName);
  await fillDatePickerField({
    page,
    trigger: createCycle.getByTestId('cycle-start-date-input'),
    date: window.startDate,
  });
  await fillDatePickerField({
    page,
    trigger: createCycle.getByTestId('cycle-end-date-input'),
    date: window.endDate,
  });
  await createCycle.getByTestId('create-cycle-button').click();
  await expect(page.getByTestId('selected-cycle-name')).toHaveText(cycleName);

  await page.getByTestId('open-apply-templates-dialog-button').click();
  const apply = page.getByRole('dialog', { name: m.cycle_apply_title({}, PT) });
  await expect(apply.getByTestId('apply-template-option')).toHaveCount(2);
  await apply.getByTestId('apply-templates-button').click();
  await expect(apply).toBeHidden();

  const cards = page.getByTestId('planning-event-card');
  await expect(cards).toHaveCount(sundays.length);
  const monthly = cards.filter({ hasText: monthlyName });
  await expect(monthly).toHaveCount(1);
  await expect(monthly).toContainText(
    formatCalendarDay({ day: parseCalendarDay({ value: firstSunday }) }),
  );
  await expect(
    monthly.getByTestId('planning-event-time-block-item'),
  ).toHaveCount(1);
  // Every other Sunday is the weekly template's three blocks, the 1st is not.
  const weekly = cards.filter({ hasText: journey.sundayTemplate.name });
  await expect(weekly).toHaveCount(sundays.length - 1);
  await expect(
    weekly.getByTestId('planning-event-time-block-item'),
  ).toHaveCount((sundays.length - 1) * 3);
});

import { expect, test } from '../fixtures/journey-recipes';

const DASHBOARD_URL = '/dashboard?section=assignments';

test('US2: volunteer reviews a confirmed assignment group and responds within 30 seconds', async ({
  page,
  volunteerAssignmentsJourney: journey,
}) => {
  const startedAt = Date.now();

  await page.goto(DASHBOARD_URL);

  await expect(
    page.getByRole('tab', { name: 'Upcoming Assignments' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByText('My Upcoming Assignments', { exact: true }),
  ).toBeVisible();
  const hideGroup = page.getByRole('button', {
    name: `Hide assignments for ${journey.assignment.eventTitle}`,
  });
  await expect(hideGroup).toBeVisible();

  // The journey persona owns exactly one assignment: a single decline
  // button also proves no foreign assignment leaks into this dashboard.
  const cannotServe = page.getByRole('button', { name: 'I cannot serve' });
  await expect(cannotServe).toHaveCount(1);
  await cannotServe.click();
  await expect(
    page.getByText('Confirm unable-to-serve notice', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Type the confirmation phrase').fill('I cannot serve');
  await page.getByRole('button', { name: 'Confirm I cannot serve' }).click();

  await expect(
    page.getByText('Leader notified that you cannot serve.', { exact: true }),
  ).toBeVisible();

  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeLessThan(30_000);
});

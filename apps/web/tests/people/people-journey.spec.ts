import { m } from '@church/i18n/messages';
import { expect, type Page, test } from '@playwright/test';
import {
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { fetchJson } from '@/tests/fixtures/journeys/identity-actions';
import { loadPeopleJourney } from '@/tests/fixtures/journeys/people-journey';

// J2 (#682) — People, end to end from the accepted leader and Volunteer J4
// leaves behind: the admin finds the Volunteer, adds a Role that survives a
// reload, then makes the leader a ChurchAdmin, which the leader's next
// authenticated request reflects. Refusals, blockers and permissions are
// proved below this seam.
const PT = { locale: 'pt-BR' } as const;

interface CallerCapabilities {
  isChurchAdmin: boolean;
}

interface OpenPersonInput {
  page: Page;
  name: string;
}

/** Finds a member through the directory search and opens their detail. */
async function openPerson({ page, name }: OpenPersonInput): Promise<void> {
  await page.goto('/people');
  await page.getByLabel(m.people_filter_search({}, PT)).fill(name);
  await page.getByLabel(m.people_filter_search({}, PT)).press('Enter');
  await page
    .getByRole('link', { name: m.people_view_label({ name }, PT) })
    .click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test.describe('J2 — maintain People after joining', () => {
  test("the admin adds a Volunteer's Role and makes the leader a ChurchAdmin", async ({
    page,
    browser,
  }, testInfo) => {
    const journey = loadPeopleJourney({ testInfo });
    const { admin, leader, volunteer } = journey.personas;
    const { worship } = journey.ministries;

    await signInPersonaPage({ page, persona: admin });
    await openPerson({ page, name: volunteer.name });

    await page
      .getByRole('button', {
        name: m.people_edit_roles_label(
          { name: volunteer.name, ministry: worship.name },
          PT,
        ),
      })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('checkbox', { name: worship.roles.vocals.name }),
    ).toBeChecked();
    await dialog
      .getByRole('checkbox', { name: worship.roles.guitar.name })
      .check();
    await dialog
      .getByRole('button', { name: m.people_roles_save({}, PT) })
      .click();
    await expect(
      page.getByText(m.people_roles_saved_toast({ name: volunteer.name }, PT)),
    ).toBeVisible();

    await page.reload();
    const card = page
      .getByRole('heading', { name: worship.name })
      .locator('xpath=ancestor::li[1]');
    await expect(card).toContainText(worship.roles.vocals.name);
    await expect(card).toContainText(worship.roles.guitar.name);

    // A leader with a fresh session before the change, so the next request is what changes.
    const leaderContext = await newPersonaContext({ browser, persona: leader });
    try {
      const before = await fetchJson<CallerCapabilities>({
        request: leaderContext.request,
        path: '/api/v1/caller-capabilities',
      });
      expect(before.isChurchAdmin).toBe(false);

      await openPerson({ page, name: leader.name });
      await page
        .getByRole('button', { name: m.people_make_admin({}, PT) })
        .click();
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: m.people_make_admin({}, PT) })
        .click();
      await expect(
        page.getByText(m.people_made_admin_toast({ name: leader.name }, PT)),
      ).toBeVisible();

      const after = await fetchJson<CallerCapabilities>({
        request: leaderContext.request,
        path: '/api/v1/caller-capabilities',
      });
      expect(after.isChurchAdmin).toBe(true);
      // The leader now reaches Church-wide People, including the Ministry-less admin.
      const leaderPage = await leaderContext.newPage();
      await openPerson({ page: leaderPage, name: admin.name });
    } finally {
      await leaderContext.close();
    }
  });
});

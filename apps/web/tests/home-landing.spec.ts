import { expect, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  SUB_LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from './global-setup';

const ROLE_STORAGE_STATES: Record<string, string> = {
  'church admin': CHURCH_ADMIN_STORAGE_STATE,
  leader: LEADER_STORAGE_STATE,
  'sub-leader': SUB_LEADER_STORAGE_STATE,
  volunteer: VOLUNTEER_STORAGE_STATE,
};

for (const [roleLabel, storageState] of Object.entries(ROLE_STORAGE_STATES)) {
  test.describe(`Home landing (${roleLabel})`, () => {
    test.use({ storageState });

    test('shows no leftover template banner and no duplicate events list', async ({
      page,
    }) => {
      await page.goto('/');

      // Leftover starter-template ASCII banner ("BETTER STACK") must be gone.
      await expect(page.getByText('██████╗', { exact: false })).toHaveCount(0);

      // The Scheduling area's EventList (heading + "New Event" affordance)
      // must not be duplicated on the home landing surface.
      await expect(
        page.getByRole('heading', { name: 'Events', exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'New Event' })).toHaveCount(
        0,
      );
    });
  });
}

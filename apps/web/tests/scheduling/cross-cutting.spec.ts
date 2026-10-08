import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import { loadPlanningAdminJourney } from '../fixtures/journeys/planning-admin';
import { loadPlanningCycleTenantsJourney } from '../fixtures/journeys/planning-cycle-tenants';
import { signInPersonaPage } from '../fixtures/journeys/rostering-church';

// DL4-X1/X2/X3 (test-plan.md): cross-cutting checks that apply across every
// user story rather than to one of them.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface PlanningCycleSummaryResponse {
  id: string;
  name: string;
}

interface PlanningCycleListResponse {
  cycles: PlanningCycleSummaryResponse[];
}

interface PlanningCycleResponse {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

test.describe('DL4-X1 church isolation', () => {
  test.use({ viewport: { width: 767, height: 1200 } });

  test('a churchB admin never sees churchA cycles in any view and cannot reach them by id', async ({
    page,
  }, testInfo) => {
    const { churchA, churchB } = loadPlanningCycleTenantsJourney({ testInfo });
    await signInPersonaPage({ page, persona: churchB.personas.admin });

    const listResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
    );
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as PlanningCycleListResponse;
    expect(list.cycles.some((cycle) => cycle.name === churchB.cycle.name)).toBe(
      true,
    );
    expect(list.cycles.some((cycle) => cycle.id === churchA.cycle.id)).toBe(
      false,
    );
    expect(list.cycles.some((cycle) => cycle.name === churchA.cycle.name)).toBe(
      false,
    );

    // Reaching churchA's cycle by its known id — never leaks the resource,
    // it resolves as not-found for this tenant (FR isolation, SC-005).
    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${churchA.cycle.id}`,
    );
    expect(detailResponse.status()).toBe(404);

    const lockResponse = await page.request.post(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${churchA.cycle.id}/lock`,
    );
    expect(lockResponse.status()).toBe(404);

    // Same check from the UI: the cycle list never renders churchA's cycle.
    await page.goto('/scheduling/planning-cycles');
    await expect(
      page
        .getByTestId('planning-cycle-option')
        .filter({ hasText: churchB.cycle.name }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('planning-cycle-option')
        .filter({ hasText: churchA.cycle.name }),
    ).toHaveCount(0);
  });
});

test.describe('DL4-X1 church isolation (reverse)', () => {
  test.use({ viewport: { width: 767, height: 1200 } });

  test('the original churchA admin never sees churchB cycles', async ({
    page,
  }, testInfo) => {
    const { churchA, churchB } = loadPlanningCycleTenantsJourney({ testInfo });
    await signInPersonaPage({ page, persona: churchA.personas.admin });

    const listResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
    );
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as PlanningCycleListResponse;
    expect(list.cycles.some((cycle) => cycle.name === churchA.cycle.name)).toBe(
      true,
    );
    expect(list.cycles.some((cycle) => cycle.name === churchB.cycle.name)).toBe(
      false,
    );
  });
});

test.describe('DL4-X2 network failure on lock', () => {
  test.use({ viewport: { width: 767, height: 1200 } });

  test('a network failure on lock shows an error and leaves the cycle in draft', async ({
    page,
  }, testInfo) => {
    const journey = loadPlanningAdminJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.admin });
    const month = {
      cycleName: 'X2 Network Failure',
      ...journey.cycleWindow,
    };
    const cycleResponse = await page.request.post(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
      {
        data: {
          name: month.cycleName,
          startDate: month.startDate,
          endDate: month.endDate,
        },
      },
    );
    expect(cycleResponse.ok()).toBeTruthy();
    const cycle = (await cycleResponse.json()) as PlanningCycleResponse;

    await page.route('**/planning-cycles/*/lock', (route) =>
      route.abort('failed'),
    );

    await page.goto('/scheduling/planning-cycles');
    await page
      .getByTestId('planning-cycle-option')
      .filter({ hasText: month.cycleName })
      .click();
    await expect(page.getByTestId('selected-cycle-name')).toHaveText(
      month.cycleName,
    );
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('draft');

    await page.getByTestId('lock-cycle-button').click();

    await expect(
      page.locator('[data-sonner-toast][data-type="error"]'),
    ).toBeVisible();
    await expect(page.getByTestId('selected-cycle-state')).toHaveText('draft');

    // Confirm no partial state server-side either — the cycle is still
    // draft after the aborted request.
    await page.unroute('**/planning-cycles/*/lock');
    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const details = (await detailResponse.json()) as {
      cycle: PlanningCycleSummaryResponse & { state: string };
    };
    expect(details.cycle.state).toBe('draft');
  });
});

test.describe('DL4-X3 double-submit has no duplicate side effect', () => {
  test.use({ viewport: { width: 767, height: 1200 } });

  test('two concurrent lock requests for the same cycle produce exactly one success', async ({
    page,
  }, testInfo) => {
    const journey = loadPlanningAdminJourney({ testInfo });
    await signInPersonaPage({ page, persona: journey.personas.admin });
    const month = {
      cycleName: 'X3 Double Submit',
      ...journey.cycleWindow,
    };
    const cycleResponse = await page.request.post(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
      {
        data: {
          name: month.cycleName,
          startDate: month.startDate,
          endDate: month.endDate,
        },
      },
    );
    expect(cycleResponse.ok()).toBeTruthy();
    const cycle = (await cycleResponse.json()) as PlanningCycleResponse;

    const [first, second] = await Promise.all([
      page.request.post(
        `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/lock`,
      ),
      page.request.post(
        `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}/lock`,
      ),
    ]);

    const statuses = [first.status(), second.status()].sort();
    // One request wins the transition (204); the other observes it has
    // already happened (409 illegal state transition) — never a second
    // successful lock.
    expect(statuses).toEqual([204, 409]);

    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${cycle.id}`,
    );
    expect(detailResponse.ok()).toBeTruthy();
    const details = (await detailResponse.json()) as {
      cycle: PlanningCycleSummaryResponse & { state: string };
    };
    expect(details.cycle.state).toBe('locked');
  });
});

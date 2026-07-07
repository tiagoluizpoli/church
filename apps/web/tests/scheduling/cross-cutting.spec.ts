import { expect, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  CHURCH_B_ADMIN_STORAGE_STATE,
} from '../global-setup';

// DL4-X1/X2/X3 (test-plan.md): cross-cutting checks that apply across every
// user story rather than to one of them.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS) — same convention as the other scheduling specs: the web package
// stays DB-tooling-free, so specs reference these well-known values directly.
const CHURCH_A_CYCLE_NAME = 'E2E December cycle';
const CHURCH_A_CYCLE_ID = 'e2e21111-1111-1111-1111-111111111111';
const CHURCH_B_CYCLE_NAME = 'E2E ChurchB Isolated Cycle';

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

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface FreshDraftMonth {
  cycleName: string;
  startDate: string;
  endDate: string;
}

// `yearBase` must be a distinct multiple of 50 per call site so concurrent
// tests (this file runs fullyParallel) never land on the same date range and
// trip the real overlap guard (OVERLAPPING_CYCLE) against each other.
function createFreshDraftMonth(
  label: string,
  yearBase: number,
): FreshDraftMonth {
  const now = new Date();
  const year = yearBase + (Math.floor(now.getTime() / 1000) % 50);
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));

  return {
    cycleName: `${label} ${year}-${String(month + 1).padStart(2, '0')} ${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
}

test.describe('DL4-X1 church isolation', () => {
  test.use({ storageState: CHURCH_B_ADMIN_STORAGE_STATE });

  test('a churchB admin never sees churchA cycles in any view and cannot reach them by id', async ({
    page,
  }) => {
    const listResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
    );
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as PlanningCycleListResponse;
    expect(
      list.cycles.some((cycle) => cycle.name === CHURCH_B_CYCLE_NAME),
    ).toBe(true);
    expect(list.cycles.some((cycle) => cycle.id === CHURCH_A_CYCLE_ID)).toBe(
      false,
    );
    expect(
      list.cycles.some((cycle) => cycle.name === CHURCH_A_CYCLE_NAME),
    ).toBe(false);

    // Reaching churchA's cycle by its known id — never leaks the resource,
    // it resolves as not-found for this tenant (FR isolation, SC-005).
    const detailResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${CHURCH_A_CYCLE_ID}`,
    );
    expect(detailResponse.status()).toBe(404);

    const lockResponse = await page.request.post(
      `${SERVER_URL}/api/v1/admin/planning-cycles/${CHURCH_A_CYCLE_ID}/lock`,
    );
    expect(lockResponse.status()).toBe(404);

    // Same check from the UI: the cycle list never renders churchA's cycle.
    await page.goto('/scheduling/planning-cycles');
    await expect(
      page
        .getByTestId('planning-cycle-option')
        .filter({ hasText: CHURCH_B_CYCLE_NAME }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('planning-cycle-option')
        .filter({ hasText: CHURCH_A_CYCLE_NAME }),
    ).toHaveCount(0);
  });
});

test.describe('DL4-X1 church isolation (reverse)', () => {
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('the original churchA admin never sees churchB cycles', async ({
    page,
  }) => {
    const listResponse = await page.request.get(
      `${SERVER_URL}/api/v1/admin/planning-cycles`,
    );
    expect(listResponse.ok()).toBeTruthy();
    const list = (await listResponse.json()) as PlanningCycleListResponse;
    expect(
      list.cycles.some((cycle) => cycle.name === CHURCH_B_CYCLE_NAME),
    ).toBe(false);
  });
});

test.describe('DL4-X2 network failure on lock', () => {
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('a network failure on lock shows an error and leaves the cycle in draft', async ({
    page,
  }) => {
    const month = createFreshDraftMonth('X2 Network Failure', 2500);
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
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('two concurrent lock requests for the same cycle produce exactly one success', async ({
    page,
  }) => {
    const month = createFreshDraftMonth('X3 Double Submit', 2600);
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

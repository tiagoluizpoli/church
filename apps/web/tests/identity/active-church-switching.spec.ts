import { expect, type Page, test } from '@playwright/test';
import { loadActiveChurchSwitchingJourney } from '../fixtures/journeys/active-church-switching';
import {
  fetchActiveChurchStatus,
  signIn,
} from '../fixtures/journeys/identity-actions';

// #67 — proves the Active Church selector and switcher (#54) hold together
// for a real dual-membership User: spec 024 §1.5 / §11.7 item 5. Lands on
// the compare-access selector C because several memberships exist and none
// is active, picks Church A, switches to Church B through the sidebar
// switcher, and the resulting page names neither Church A's real Planning
// Cycle names nor its Ministry name anywhere — a real-value negative
// assertion, not an empty-list one (spec 024 §11.2 rule 2).
//
// The journey owns both Churches (the `active-church-switching` recipe):
// the dual member is Church A's ChurchAdmin and an active Volunteer of its
// Worship Ministry, with two Planning Cycles of Church A to see, and a plain
// member of Church B with no Ministry there — an active Volunteer in only
// one Church.
interface ChurchOptionRowInput {
  page: Page;
  churchId: string;
}

/**
 * Selector C renders every Church twice — a mobile card list (`md:hidden`)
 * and a desktop table (`hidden md:block`) — both physically present, one
 * hidden by viewport. `select-church.tsx` keys each row's `data-testid` by
 * `church.churchId` (matching the `planning-cycle-row-${id}` convention
 * elsewhere in this app), so `:visible` is still needed to pick the one
 * layout actually on screen at the default desktop viewport.
 */
function churchOptionRow({ page, churchId }: ChurchOptionRowInput) {
  return page.locator(
    `[data-testid="select-church-option-${churchId}"]:visible`,
  );
}

interface PlanningCycleRowInput {
  page: Page;
  cycleId: string;
}

/** Same DataTable dual-render (mobile card + desktop table row) as
 * `churchOptionRow` above — `:visible` picks the one on screen. */
function planningCycleRow({ page, cycleId }: PlanningCycleRowInput) {
  return page.locator(`[data-testid="planning-cycle-row-${cycleId}"]:visible`);
}

test.describe('#67 — Active Church selection and switching', () => {
  test('a dual-membership User selects Church A, switches to Church B, and Church A leaves no remnant', async ({
    page,
  }, testInfo) => {
    const journey = loadActiveChurchSwitchingJourney({ testInfo });
    const churchA = journey.churchA.church;
    const churchB = journey.churchB.church;
    const { first: firstCycle, second: secondCycle } = journey.cycles;
    // Real values that only exist inside Church A — the negative assertion
    // after switching to Church B names these exact strings (spec 024 §11.2
    // rule 2: "name, id and slug", not just an empty-list check).
    const churchAMinistryName = journey.churchA.ministries.worship.name;

    await page.goto('/login');
    await signIn({ page, persona: journey.churchA.personas.dualMember });

    // AC2 — several Church Memberships and no Active Church shows selector C.
    await expect(page).toHaveURL(/\/select-church(\?.*)?$/);
    await expect(churchOptionRow({ page, churchId: churchA.id })).toContainText(
      churchA.name,
    );
    await expect(churchOptionRow({ page, churchId: churchB.id })).toContainText(
      churchB.name,
    );

    await churchOptionRow({ page, churchId: churchA.id }).click();
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    expect(
      await fetchActiveChurchStatus({ request: page.request }),
    ).toMatchObject({ churchId: churchA.id });

    // Prove Church A's real values are actually on the page before the
    // switch — otherwise their later absence would prove nothing.
    await page.goto('/scheduling/planning-cycles');
    await expect(page.getByTestId('planning-admin-page')).toBeVisible();
    await expect(
      planningCycleRow({ page, cycleId: firstCycle.id }),
    ).toContainText(firstCycle.name);
    await expect(
      planningCycleRow({ page, cycleId: secondCycle.id }),
    ).toContainText(secondCycle.name);

    // The sidebar switcher (#54) — spec 024 §1.5 places it above the
    // Church-scoped nav, not inside `UserMenu` (the User-identity menu).
    await page
      .getByTestId('sidebar')
      .getByRole('button', { name: 'Switch Church' })
      .click();
    await expect(page).toHaveURL(/\/select-church(\?.*)?$/);

    await churchOptionRow({ page, churchId: churchB.id }).click();
    // Church B has no scheduling access, so the "preserve" route policy
    // falls back to the dashboard (spec 024 §1.5) once the switch commits.
    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    expect(
      await fetchActiveChurchStatus({ request: page.request }),
    ).toMatchObject({ churchId: churchB.id });

    // AC3 — Church A's real name/identifiers appear nowhere in the
    // rendered page. This dual member has no Ministry (nor Church-admin)
    // access in Church B, so `useCallerRoles`' `scheduling-capability` query
    // — cleared and refetched fresh by `clearActiveChurchScopedCache` on
    // every switch (`active-church-switch.ts`) — resolves
    // `canAccessScheduling: false` for B, and `AppShell` omits the whole
    // Scheduling nav branch (`Cycles` included) rather than rendering a link
    // that would 403 through the route guard. A `Cycles` link that survived
    // the switch would itself be the leak this AC guards against — the
    // in-app control from which Church A's Planning Cycle data was ever
    // reachable, so its absence here is exactly what "no remnant" requires.
    await expect(
      page.getByTestId('sidebar').getByRole('link', { name: 'Cycles' }),
    ).not.toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain(firstCycle.name);
    expect(bodyText).not.toContain(secondCycle.name);
    expect(bodyText).not.toContain(churchAMinistryName);
    expect(bodyText).not.toContain(churchA.name);
    expect(bodyText).not.toContain(churchA.id);
    expect(bodyText).not.toContain(churchA.slug);
  });
});

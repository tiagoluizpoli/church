import { m } from '@church/i18n/messages';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  assignPreparePath,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadLeaderPrepareJourney } from '@/tests/fixtures/journeys/leader-prepare';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
const CYCLE_NAME = 'Panel Prepare';
const SHOTS = `${process.env.HOME}/.local/state/agent-runs/spec-877/t949-ui`;

interface IdResponse {
  id: string;
}

interface TemplateBsendResponse {
  id: string;
}

interface TemplateResponse extends IdResponse {
  blocks: TemplateBsendResponse[];
}

interface ParticipationSummaryResponse {
  id: string;
}

interface EventTimeBlockSummaryResponse {
  id: string;
  label?: string;
}

interface EventTimeBlockEntryResponse {
  eventTimeBlock: EventTimeBlockSummaryResponse;
}

interface ParticipationEventResponse {
  participation: ParticipationSummaryResponse;
  eventTimeBlocks: EventTimeBlockEntryResponse[];
}

interface ParticipationResponse {
  events: ParticipationEventResponse[];
}

async function seedCycle(page: Page, testInfo: TestInfo) {
  const journey = loadLeaderPrepareJourney({ testInfo });
  await signInPersonaPage({ page, persona: journey.personas.leader });
  const ministryId = journey.ministries.worship.id;
  const roleId = journey.ministries.worship.roles.usher.id;
  const sectorId = journey.ministries.worship.sectors.stage.id;
  const cycle = (await (
    await page.request.post(`${SERVER_URL}/api/v1/admin/cycles`, {
      data: {
        name: CYCLE_NAME,
        startDate: journey.cycleWindow.startDate,
        endDate: journey.cycleWindow.endDate,
      },
    })
  ).json()) as IdResponse;
  // Many blocks: the list must scroll for the return-scroll check to mean anything.
  const labels = Array.from({ length: 14 }, (_, index) => `Block ${index + 1}`);
  const template = (await (
    await page.request.post(`${SERVER_URL}/api/v1/admin/event-templates`, {
      data: {
        name: 'Panel Template',
        recurrence: { kind: 'weekly', weekdays: [0] },
        blocks: labels.map((label, index) => ({
          label,
          startTime: `${String(6 + index).padStart(2, '0')}:00`,
          endTime: `${String(6 + index).padStart(2, '0')}:30`,
        })),
      },
    })
  ).json()) as TemplateResponse;
  for (const block of template.blocks) {
    await page.request.put(
      `${SERVER_URL}/api/v1/ministries/${ministryId}/usual-setup/${block.id}`,
      {
        data: {
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [{ shiftIndex: 0, sectorId, roleId, peopleNeeded: 1 }],
        },
      },
    );
  }
  await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/apply-templates`,
    { data: { templateIds: [template.id] } },
  );
  await page.request.post(`${SERVER_URL}/api/v1/admin/cycles/${cycle.id}/send`);
  const participation = (await (
    await page.request.get(
      `${SERVER_URL}/api/v1/prepare/cycles/${cycle.id}/participation`,
      { params: { ministryId } },
    )
  ).json()) as ParticipationResponse;
  const blocks = participation.events[0]?.eventTimeBlocks ?? [];
  return {
    path: assignPreparePath({ ministryId, cycleId: cycle.id }),
    ids: blocks.map((entry) => entry.eventTimeBlock.id),
  };
}

test('panel closes with a slide-out, X is guarded, and has an h2 at xl', async ({
  page,
}, testInfo) => {
  const { path, ids } = await seedCycle(page, testInfo);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${path}/slots/${ids[0]}`);
  const panel = page.getByTestId('prepare-block-panel');
  await expect(panel).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: /Block 1/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/xl-open.png` });
  // Dirty: the X asks first, and Stay keeps the panel.
  await panel.getByRole('spinbutton').first().fill('7');
  await panel
    .getByRole('button', {
      name: m.prepare_close_block({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/xl-x-dirty-guard.png` });
  await page
    .getByRole('button', {
      name: m.prepare_block_stay({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(panel).toBeVisible();
  // Leave: the panel slides out (still in the DOM, inert, mid-animation) and then unmounts.
  await panel
    .getByRole('button', {
      name: m.prepare_close_block({}, { locale: 'pt-BR' }),
    })
    .click();
  // Sample the panel's opacity every frame across the close: it must fade, not vanish.
  await page.evaluate(() => {
    const samples: number[] = [];
    (window as unknown as { opacitySamples: number[] }).opacitySamples =
      samples;
    const tick = () => {
      const node = document.querySelector(
        '[data-testid="prepare-block-panel"]',
      );
      if (node) samples.push(Number(getComputedStyle(node).opacity));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page
    .getByRole('button', {
      name: m.prepare_block_leave({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`${path}(#.*)?$`));
  await page.screenshot({ path: `${SHOTS}/xl-closing-midway.png` });
  await expect(panel).toHaveCount(0);
  const samples = await page.evaluate(
    () => (window as unknown as { opacitySamples: number[] }).opacitySamples,
  );
  expect(samples.length).toBeGreaterThan(3);
  expect(Math.min(...samples)).toBeLessThan(0.9);
  await expect(panel).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/xl-closed.png` });
});

test('narrow editor has an h1 and returning leaves the row below the sticky top bar', async ({
  page,
}, testInfo) => {
  const { path, ids } = await seedCycle(page, testInfo);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  const lastId = ids[ids.length - 1];
  const row = page.locator(`#event-time-block-${lastId}`);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(
    page.getByRole('heading', { level: 1, name: /Block 14/ }),
  ).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/mobile-open-h1.png` });
  await page
    .getByRole('button', {
      name: m.prepare_close_block({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`${path}(#.*)?$`));
  await expect(row).toBeVisible();
  const topbar = await page.locator('header.sticky').first().boundingBox();
  await expect
    .poll(async () => (await row.boundingBox())?.y ?? 0)
    .toBeGreaterThanOrEqual((topbar?.y ?? 0) + (topbar?.height ?? 0));
  await page.screenshot({ path: `${SHOTS}/mobile-returned.png` });
  // Return from the first block too: the row sits at the very top of the list.
  await page.locator(`#event-time-block-${ids[0]}`).scrollIntoViewIfNeeded();
  await page.locator(`#event-time-block-${ids[0]}`).click();
  await page
    .getByRole('button', {
      name: m.prepare_close_block({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect
    .poll(
      async () =>
        (await page.locator(`#event-time-block-${ids[0]}`).boundingBox())?.y ??
        0,
    )
    .toBeGreaterThanOrEqual((topbar?.y ?? 0) + (topbar?.height ?? 0));
  await page.screenshot({ path: `${SHOTS}/mobile-returned-first.png` });
});

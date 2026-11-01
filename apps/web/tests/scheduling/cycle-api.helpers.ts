import { type APIResponse, expect, type Page } from '@playwright/test';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';

/**
 * Seeds planning state through the admin API, for specs whose assertions
 * start after the cycle exists: the create/template/apply UI flow itself is
 * asserted by us1-admin-plan and the cycles-table-view US3 edit
 * test, and costs ~8 s of UI per test where these calls take well under 1 s.
 * Requests ride the page's storage state, so they act as its persona.
 */
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface ExpectOkParams {
  response: APIResponse;
  step: string;
}

/** Fails with the status and body, so a 409 or 500 says which one. */
async function expectOk({ response, step }: ExpectOkParams): Promise<void> {
  expect(
    response.ok(),
    `${step}: ${response.status()} ${await response.text()}`,
  ).toBeTruthy();
}

interface CreateCycleViaApiParams {
  page: Page;
  name: string;
  startDate: string;
  endDate: string;
}

interface CreatedCycle {
  id: string;
}

export async function createCycleViaApi({
  page,
  name,
  startDate,
  endDate,
}: CreateCycleViaApiParams): Promise<CreatedCycle> {
  const response = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles`,
    { data: { name, startDate, endDate } },
  );
  await expectOk({ response, step: `create cycle ${startDate}` });
  return (await response.json()) as CreatedCycle;
}

export interface EventTemplateTimeBlockInput {
  label: string;
  startTime: string;
  endTime: string;
}

interface CreateEventTemplateViaApiParams {
  page: Page;
  name: string;
  weekday: number;
  blocks: EventTemplateTimeBlockInput[];
}

interface CreatedEventTemplate {
  id: string;
}

export async function createEventTemplateViaApi({
  page,
  name,
  weekday,
  blocks,
}: CreateEventTemplateViaApiParams): Promise<CreatedEventTemplate> {
  const response = await page.request.post(
    `${SERVER_URL}/api/v1/admin/event-templates`,
    { data: { name, weekday, blocks } },
  );
  await expectOk({ response, step: `create template ${name}` });
  return (await response.json()) as CreatedEventTemplate;
}

interface ApplyTemplatesViaApiParams {
  page: Page;
  cycleId: string;
  templateIds: string[];
}

export async function applyTemplatesViaApi({
  page,
  cycleId,
  templateIds,
}: ApplyTemplatesViaApiParams): Promise<void> {
  const response = await page.request.post(
    `${SERVER_URL}/api/v1/admin/cycles/${cycleId}/apply-templates`,
    { data: { templateIds } },
  );
  await expectOk({ response, step: `apply templates to cycle ${cycleId}` });
}

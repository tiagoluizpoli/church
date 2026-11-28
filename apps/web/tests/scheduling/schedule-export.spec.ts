import { readFileSync } from 'node:fs';
import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import {
  assignPreparePath,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadSchedulePublishJourney } from '@/tests/fixtures/journeys/schedule-publish';

// The journeys run in pt-BR (playwright.config.ts).
const ptBR = { locale: 'pt-BR' } as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('a leader opens Exportar on a Schedule, sees the preview and downloads the card image', async ({
  page,
}, testInfo) => {
  // The never-published Schedule of the recipe: the file is a draft.
  const journey = loadSchedulePublishJourney({ testInfo });
  const ministry = journey.ministries.worship;
  await signInPersonaPage({ page, persona: journey.personas.leader });
  await page.goto(
    assignPreparePath({ ministryId: ministry.id, cycleId: journey.cycle.id }),
  );

  await page.getByRole('button', { name: m.export_open({}, ptBR) }).click();
  const dialog = page.getByRole('dialog', {
    name: m.export_dialog_title({}, ptBR),
  });
  await expect(
    dialog.getByRole('radio', { name: m.export_format_cards({}, ptBR) }),
  ).toBeChecked();
  // The preview is the server's own render of the cards.
  await expect(
    dialog.getByRole('img', {
      name: m.export_preview_page({ page: '1' }, ptBR),
    }),
  ).toBeVisible({ timeout: 30_000 });

  const download = page.getByRole('button', {
    name: m.export_download({}, ptBR),
  });
  await expect(download).toBeEnabled({ timeout: 30_000 });
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    download.click(),
  ]);
  expect(file.suggestedFilename()).toBe(
    `${m.export_file_name({ ministry: ministry.name, cycle: journey.cycle.name }, ptBR)} - ${m.export_draft({}, ptBR)}.png`,
  );
  await expect(dialog).toBeHidden();

  const saved = testInfo.outputPath('cards.png');
  await file.saveAs(saved);
  const bytes = readFileSync(saved);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  // IHDR: a 1080 px wide card, never taller than 1600 px.
  expect(bytes.readUInt32BE(16)).toBe(1080);
  expect(bytes.readUInt32BE(20)).toBeLessThanOrEqual(1600);
});

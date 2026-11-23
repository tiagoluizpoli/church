import { m } from '@church/i18n/messages';
import { expect, type Page, test } from '@playwright/test';
import {
  newPersonaContext,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadMinistryWorkspaceIndexJourney } from '@/tests/fixtures/journeys/ministry-workspace-index';

// #1017 / #996: Church Settings end to end. The ChurchAdmin uploads a logo
// (applied at once, through object storage) and saves the settings, then a
// reload shows both; a Member who isn't a ChurchAdmin can't reach the screen.
// Each refusal and the undo are proved at the HTTP and component seams.
const PT = { locale: 'pt-BR' } as const;
const WEBSITE = 'igreja-e2e.example.org';

interface LogoPngInput {
  page: Page;
}

/** A 400×300 (4:3) PNG drawn by the browser, so the spec needs no binary fixture. */
async function logoPng({ page }: LogoPngInput): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    context.fillStyle = '#0f766e';
    context.fillRect(0, 0, 400, 300);
    context.fillStyle = '#ffffff';
    context.fillRect(150, 100, 100, 100);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  return Buffer.from(base64, 'base64');
}

interface ExpectLogoShownInput {
  page: Page;
}

/** The preview's light-mode tile (the app's shared logo tile) shows the stored logo, actually loaded from storage. */
async function expectLogoShown({ page }: ExpectLogoShownInput): Promise<void> {
  const logo = page
    .getByTestId('church-preview-logo-light')
    .getByTestId('church-logo-tile')
    .getByRole('img');
  await expect(logo).toHaveAttribute('src', /\/logo\/[0-9a-f]{64}\.png$/);
  await expect
    .poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(400);
}

test.describe('Church Settings', () => {
  test('a ChurchAdmin uploads a logo and saves the settings; a Member cannot reach the screen', async ({
    page,
    browser,
  }, testInfo) => {
    const journey = loadMinistryWorkspaceIndexJourney({ testInfo });
    const { admin, ministryLeader } = journey.personas;

    await signInPersonaPage({ page, persona: admin });
    await page.goto('/app/church-settings');
    await expect(
      page.getByRole('heading', { name: m.church_settings_title({}, PT) }),
    ).toBeVisible();

    await page.getByLabel(m.church_settings_logo_file({}, PT)).setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: await logoPng({ page }),
    });
    // Already 4:3: the framing dialog offers to send it as it is.
    await page
      .getByRole('button', {
        name: m.church_settings_logo_crop_original({}, PT),
      })
      .click();
    await expect(
      page.getByText(m.church_settings_logo_updated({}, PT)),
    ).toBeVisible();
    await expectLogoShown({ page });

    await page
      .getByRole('textbox', { name: m.church_settings_website_label({}, PT) })
      .fill(WEBSITE);
    await page
      .getByRole('button', { name: m.church_settings_save({}, PT) })
      .click();
    await expect(page.getByText(m.church_settings_saved({}, PT))).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('textbox', {
        name: m.church_settings_website_label({}, PT),
      }),
    ).toHaveValue(`https://${WEBSITE}`);
    await expectLogoShown({ page });
    await expect(
      page.getByRole('button', {
        name: m.church_settings_logo_replace({}, PT),
      }),
    ).toBeVisible();

    const memberContext = await newPersonaContext({
      browser,
      persona: ministryLeader,
    });
    try {
      const memberPage = await memberContext.newPage();
      await memberPage.goto('/app/church-settings');
      await expect(
        memberPage.getByText(m.shell_no_access({}, PT)),
      ).toBeVisible();
      await expect(
        memberPage.getByLabel(m.church_settings_logo_file({}, PT)),
      ).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });
});

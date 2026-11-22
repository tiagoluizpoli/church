import { m } from '@church/i18n/messages';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetChurchSettings200,
  UpdateChurchSettingsBody,
} from '@/infrastructure/api/churchAPI.schemas';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import type { ChildrenProps } from '@/tests/setup/children-props';
import { renderRoute } from '@/tests/setup/render-route';

const getCallerCapabilities = vi.fn();
const getChurchSettings = vi.fn();
const updateChurchSettings = vi.fn();
const toastSuccess = vi.fn();
const toastPlain = vi.fn();
const uploadChurchLogo = vi.fn();
const removeChurchLogo = vi.fn();
const restoreChurchLogo = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  churchSettingsApi: {
    getChurchSettings: (...args: unknown[]) => getChurchSettings(...args),
    updateChurchSettings: (...args: unknown[]) => updateChurchSettings(...args),
    uploadChurchLogo: (...args: unknown[]) => uploadChurchLogo(...args),
    removeChurchLogo: (...args: unknown[]) => removeChurchLogo(...args),
    restoreChurchLogo: (...args: unknown[]) => restoreChurchLogo(...args),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: (...args: unknown[]) =>
      getCallerCapabilities(...args),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
  },
}));

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: ChildrenProps) => children,
}));

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

vi.mock('sonner', () => ({
  toast: Object.assign((...args: unknown[]) => toastPlain(...args), {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  }),
}));

const SAVED: GetChurchSettings200 = {
  name: 'Igreja Semente',
  slug: 'igreja-semente',
  website: 'https://igreja-semente.test',
  accentColor: '#0f766e',
  logoKey: null,
  logoUrl: null,
  publicOrigin: 'https://app.church.test',
};

const LOGO_KEY = `public/churches/c1/logo/${'a'.repeat(64)}.png`;
const LOGO_URL = `https://storage.test/church/${LOGO_KEY}`;
const WITH_LOGO = { ...SAVED, logoKey: LOGO_KEY, logoUrl: LOGO_URL };

interface FieldErrorFixture {
  field: string;
  code: string;
  message: string;
}

function refusedSave(fieldErrors: FieldErrorFixture[]): AxiosError {
  return new AxiosError(
    'Unprocessable',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status: 422,
      data: {
        error: 'VALIDATION_ERROR',
        message: 'Algumas informações enviadas são inválidas.',
        fieldErrors,
      },
    } as AxiosResponse,
  );
}

function renderSettings() {
  return renderRoute({
    initialPath: '/app/church-settings',
    churchTimezone: 'UTC',
  });
}

async function nameField() {
  return screen.findByRole('textbox', {
    name: m.church_settings_name_label(),
  });
}

function saveBar() {
  return screen.queryByRole('region', { name: m.church_settings_unsaved() });
}

function infoSection() {
  return screen.getByRole('button', {
    name: new RegExp(m.church_settings_section_info()),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallerCapabilities.mockResolvedValue(
    callerCapabilitiesFixture({ isChurchAdmin: true }),
  );
  getChurchSettings.mockResolvedValue(SAVED);
  updateChurchSettings.mockImplementation(
    async (body: UpdateChurchSettingsBody) => ({ ...SAVED, ...body }),
  );
});

describe('Church Settings screen', () => {
  it('refuses a Member who is not a ChurchAdmin without reading the settings', async () => {
    getCallerCapabilities.mockResolvedValue(
      callerCapabilitiesFixture({ ledMinistries: 1 }),
    );

    renderSettings();

    expect(await screen.findByText(m.shell_no_access())).toBeInTheDocument();
    expect(getChurchSettings).not.toHaveBeenCalled();
  });

  it('shows the saved settings, public vs admin-only counts, the Address slot and the Programme pointer', async () => {
    renderSettings();

    expect(await nameField()).toHaveValue('Igreja Semente');
    expect(
      screen.getByRole('textbox', { name: m.church_settings_website_label() }),
    ).toHaveValue('https://igreja-semente.test');
    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('3');
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('0');
    expect(
      screen.getByText('https://app.church.test/igreja-semente'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(m.church_settings_section_address()),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: m.nav_event_templates() }),
    ).toHaveAttribute('href', '/app/event-templates');
    expect(saveBar()).not.toBeInTheDocument();
  });

  it('counts an emptied website out of the public items', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.clear(
      await screen.findByRole('textbox', {
        name: m.church_settings_website_label(),
      }),
    );

    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('2');
  });

  it('shows the save bar only once something changed and saves the whole set with the button', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.type(await nameField(), ' Viva');
    expect(saveBar()).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith({
        name: 'Igreja Semente Viva',
        website: 'https://igreja-semente.test',
        accentColor: '#0f766e',
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith(m.church_settings_saved());
    await waitFor(() => expect(saveBar()).not.toBeInTheDocument());
  });

  it('saves on Ctrl+S, and picking "Padrão do app" clears the accent colour', async () => {
    const user = userEvent.setup();
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', { name: m.church_settings_accent_default() }),
    );
    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith({
        name: 'Igreja Semente',
        website: 'https://igreja-semente.test',
        accentColor: null,
      }),
    );
  });

  it('ignores Ctrl+S while nothing changed', async () => {
    const user = userEvent.setup();
    renderSettings();
    await nameField();

    await user.keyboard('{Control>}s{/Control}');

    expect(updateChurchSettings).not.toHaveBeenCalled();
  });

  it('marks, counts and reopens every refused field after a failed save, and clears each error on edit', async () => {
    updateChurchSettings.mockRejectedValue(
      refusedSave([
        {
          field: 'name',
          code: 'CHURCH_NAME_LENGTH',
          message: 'O nome deve ter entre 2 e 80 caracteres.',
        },
        {
          field: 'website',
          code: 'CHURCH_WEBSITE_HTTPS_ONLY',
          message: 'Use um endereço que comece com https://.',
        },
      ]),
    );
    const user = userEvent.setup();
    renderSettings();
    const name = await nameField();
    await user.clear(name);
    await user.type(name, 'X');
    await user.click(infoSection());
    expect(name).not.toBeInTheDocument();

    await user.keyboard('{Control>}s{/Control}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      m.church_settings_failed_many({ count: 2 }),
    );
    const reopened = await nameField();
    expect(reopened).toHaveAttribute('aria-invalid', 'true');
    expect(reopened).toHaveAccessibleDescription(
      'O nome deve ter entre 2 e 80 caracteres.',
    );
    const website = screen.getByRole('textbox', {
      name: m.church_settings_website_label(),
    });
    expect(website).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(saveBar() as HTMLElement).getByText(
        m.church_settings_error_count_many({ count: 2 }),
      ),
    ).toBeInTheDocument();
    expect(infoSection()).toHaveTextContent(
      m.church_settings_section_errors_many({ count: 2 }),
    );

    await user.type(reopened, 'Y');

    expect(reopened).not.toHaveAttribute('aria-invalid');
    expect(website).toHaveAttribute('aria-invalid', 'true');
    expect(infoSection()).toHaveTextContent(
      m.church_settings_section_errors_one(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      m.church_settings_failed_one(),
    );
  });

  it('collapses and expands every section, showing a summary when collapsed', async () => {
    const user = userEvent.setup();
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', { name: m.church_settings_collapse_all() }),
    );

    expect(
      screen.queryByRole('textbox', { name: m.church_settings_name_label() }),
    ).not.toBeInTheDocument();
    expect(infoSection()).toHaveAttribute('aria-expanded', 'false');
    expect(infoSection()).toHaveTextContent(
      'Igreja Semente · https://app.church.test/igreja-semente',
    );

    await user.click(
      screen.getByRole('button', { name: m.church_settings_expand_all() }),
    );

    expect(await nameField()).toBeInTheDocument();
  });

  it('opens the preview in a drawer from "Ver prévia"', async () => {
    const user = userEvent.setup();
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', { name: m.church_settings_show_preview() }),
    );

    const drawer = await screen.findByRole('dialog', {
      name: m.church_settings_preview_title(),
    });
    expect(within(drawer).getByText('Igreja Semente')).toBeInTheDocument();
    expect(within(drawer).getByText('igreja-semente.test')).toBeInTheDocument();
  });

  describe('logo', () => {
    function logoFile(type = 'image/png', size = 1024): File {
      return new File([new Uint8Array(size)], 'logo.png', { type });
    }

    function fileInput() {
      return screen.getByLabelText(m.church_settings_logo_file());
    }

    function refusedLogo(status: number, error: string, message: string) {
      return new AxiosError(
        'Refused',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        { status, data: { error, message } } as AxiosResponse,
      );
    }

    it('uploads at once, keeps unsaved edits and previews the logo in light, dark and the email band', async () => {
      const user = userEvent.setup();
      uploadChurchLogo.mockResolvedValue({ ...WITH_LOGO, name: 'Ignorado' });
      renderSettings();
      await user.type(await nameField(), ' Viva');
      const file = logoFile();

      await user.upload(fileInput(), file);

      await waitFor(() =>
        expect(uploadChurchLogo).toHaveBeenCalledWith({ file }),
      );
      expect(toastSuccess).toHaveBeenCalledWith(
        m.church_settings_logo_updated(),
      );
      expect(await nameField()).toHaveValue('Igreja Semente Viva');
      expect(saveBar()).toBeInTheDocument();
      for (const testId of [
        'church-preview-logo-light',
        'church-preview-logo-dark',
        'church-preview-email-band',
      ]) {
        const logo = within(screen.getByTestId(testId)).getByRole('img', {
          name: m.church_settings_logo_alt(),
        });
        expect(logo).toHaveAttribute('src', LOGO_URL);
        expect(logo).toHaveClass('object-contain');
      }
      expect(
        screen.getByRole('button', { name: m.church_settings_logo_replace() }),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('church-settings-public-count'),
      ).toHaveTextContent('4');
    });

    it.each([
      [
        413,
        'LOGO_TOO_LARGE',
        'A imagem passa de 5 MB. Envie um arquivo menor.',
      ],
      [
        422,
        'LOGO_TOO_SMALL',
        'A imagem é pequena demais: o lado maior precisa ter pelo menos 128 px.',
      ],
      [
        422,
        'LOGO_BAD_ASPECT_RATIO',
        'A imagem é larga ou alta demais: a proporção precisa ficar entre 1:4 e 4:1.',
      ],
      [
        415,
        'LOGO_UNSUPPORTED_TYPE',
        'Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.',
      ],
    ])('shows the server refusal %i %s in its own words', async (status, error, message) => {
      const user = userEvent.setup();
      uploadChurchLogo.mockRejectedValue(refusedLogo(status, error, message));
      renderSettings();
      await nameField();

      await user.upload(fileInput(), logoFile());

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });

    it('refuses a file over 5 MB or of another type without uploading it', async () => {
      const user = userEvent.setup({ applyAccept: false });
      renderSettings();
      await nameField();

      await user.upload(
        fileInput(),
        logoFile('image/png', 5 * 1024 * 1024 + 1),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        m.error_logo_too_large(),
      );

      await user.upload(fileInput(), logoFile('image/svg+xml'));
      expect(screen.getByRole('alert')).toHaveTextContent(
        m.error_logo_unsupported_type(),
      );
      expect(uploadChurchLogo).not.toHaveBeenCalled();
    });

    it('removes the logo and puts the same one back with Desfazer', async () => {
      const user = userEvent.setup();
      getChurchSettings.mockResolvedValue(WITH_LOGO);
      removeChurchLogo.mockResolvedValue(SAVED);
      restoreChurchLogo.mockResolvedValue(WITH_LOGO);
      renderSettings();

      await user.click(
        await screen.findByRole('button', {
          name: new RegExp(m.church_settings_logo_remove()),
        }),
      );

      await waitFor(() =>
        expect(toastPlain).toHaveBeenCalledWith(
          m.church_settings_logo_removed(),
          expect.objectContaining({
            action: expect.objectContaining({
              label: m.church_settings_logo_undo(),
            }),
          }),
        ),
      );
      expect(
        await screen.findByRole('button', {
          name: new RegExp(m.church_settings_logo_upload()),
        }),
      ).toBeInTheDocument();

      const [, { action }] = toastPlain.mock.calls[0] as [
        string,
        { action: { onClick: () => void } },
      ];
      action.onClick();

      await waitFor(() =>
        expect(restoreChurchLogo).toHaveBeenCalledWith({ key: LOGO_KEY }),
      );
      expect(
        await screen.findByRole('button', {
          name: new RegExp(m.church_settings_logo_replace()),
        }),
      ).toBeInTheDocument();
    });
  });
});

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
const getChurchSlugAvailability = vi.fn();
const toastSuccess = vi.fn();
const toastPlain = vi.fn();
const uploadChurchLogo = vi.fn();
const removeChurchLogo = vi.fn();
const restoreChurchLogo = vi.fn();

vi.mock('@/utils/api-instances', async () => ({
  churchSettingsApi: {
    getChurchSettings: (...args: unknown[]) => getChurchSettings(...args),
    updateChurchSettings: (...args: unknown[]) => updateChurchSettings(...args),
    getChurchSlugAvailability: (...args: unknown[]) =>
      getChurchSlugAvailability(...args),
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
  addresses: [],
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
  getChurchSlugAvailability.mockResolvedValue({ status: 'free' });
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
        addresses: [],
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
        addresses: [],
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

  it('opens the saved public page in a new tab from "Ver página pública"', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.type(await nameField(), ' Nova');

    const link = screen.getByRole('link', { name: 'Ver página pública' });
    expect(link).toHaveAttribute(
      'href',
      'https://app.church.test/igreja-semente',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
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

    it('marks the Active Church options stale after an upload so the header shows the new logo', async () => {
      const user = userEvent.setup();
      uploadChurchLogo.mockResolvedValue(WITH_LOGO);
      const { queryClient } = renderSettings();
      await nameField();
      queryClient.setQueryData(['active-church', 'options'], { churches: [] });

      await user.upload(fileInput(), logoFile());

      await waitFor(() =>
        expect(
          queryClient.getQueryState(['active-church', 'options'])
            ?.isInvalidated,
        ).toBe(true),
      );
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

  describe('Church Slug', () => {
    function slugField() {
      return screen.findByRole('textbox', {
        name: m.church_settings_slug_label(),
      });
    }

    it('shows the full address under the slug as it is typed', async () => {
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();

      await user.clear(slug);
      await user.type(slug, 'esperanca');

      expect(
        screen.getByText('https://app.church.test/esperanca'),
      ).toBeInTheDocument();
    });

    it('generates the slug from the name and never changes it when the name is edited', async () => {
      const user = userEvent.setup();
      renderSettings();
      const name = await nameField();
      await user.clear(name);
      await user.type(name, 'Igreja Batista Esperança');
      expect(await slugField()).toHaveValue('igreja-semente');

      await user.click(
        screen.getByRole('button', { name: m.church_settings_slug_generate() }),
      );

      expect(await slugField()).toHaveValue('igreja-batista-esperanca');
    });

    it('asks for confirmation before a changed slug is saved, and saves it once confirmed', async () => {
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();
      await user.clear(slug);
      await user.type(slug, 'esperanca');

      await user.click(
        screen.getByRole('button', { name: m.church_settings_save() }),
      );

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent('/igreja-semente');
      expect(dialog).toHaveTextContent('/esperanca');
      expect(updateChurchSettings).not.toHaveBeenCalled();
      await user.click(
        within(dialog).getByRole('button', {
          name: m.church_settings_slug_confirm_action(),
        }),
      );
      await waitFor(() =>
        expect(updateChurchSettings).toHaveBeenCalledWith({
          name: 'Igreja Semente',
          website: 'https://igreja-semente.test',
          accentColor: '#0f766e',
          addresses: [],
          slug: 'esperanca',
        }),
      );
    });

    it('saves nothing when the confirmation is declined', async () => {
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();
      await user.clear(slug);
      await user.type(slug, 'esperanca');
      await user.click(
        screen.getByRole('button', { name: m.church_settings_save() }),
      );

      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: m.church_settings_slug_confirm_cancel(),
        }),
      );

      expect(updateChurchSettings).not.toHaveBeenCalled();
      expect(await slugField()).toHaveValue('esperanca');
    });

    it('does not ask when only the name changed', async () => {
      const user = userEvent.setup();
      renderSettings();
      await user.type(await nameField(), ' Viva');

      await user.click(
        screen.getByRole('button', { name: m.church_settings_save() }),
      );

      await waitFor(() => expect(updateChurchSettings).toHaveBeenCalled());
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it.each([
      ['Igreja Nova', m.error_church_settings_slug_format()],
      ['ab', m.error_church_settings_slug_length()],
      ['admin', m.error_church_settings_slug_reserved()],
    ])('shows a clear error for %j and does not save', async (typed, message) => {
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();
      await user.clear(slug);
      await user.type(slug, typed);

      expect(slug).toHaveAccessibleDescription(message);
      await user.click(
        screen.getByRole('button', { name: m.church_settings_save() }),
      );
      expect(updateChurchSettings).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('says a slug is taken as soon as the field is left', async () => {
      getChurchSlugAvailability.mockResolvedValue({ status: 'taken' });
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();
      await user.clear(slug);
      await user.type(slug, 'church-b');

      await user.tab();

      await waitFor(() =>
        expect(slug).toHaveAccessibleDescription(
          m.error_church_settings_slug_taken(),
        ),
      );
      expect(getChurchSlugAvailability).toHaveBeenCalledWith({
        slug: 'church-b',
      });
    });

    it("shows the server's refusal of a slug taken meanwhile", async () => {
      updateChurchSettings.mockRejectedValue(
        refusedSave([
          {
            field: 'slug',
            code: 'CHURCH_SLUG_TAKEN',
            message: m.error_church_settings_slug_taken(),
          },
        ]),
      );
      const user = userEvent.setup();
      renderSettings();
      const slug = await slugField();
      await user.clear(slug);
      await user.type(slug, 'church-b');
      await user.click(
        screen.getByRole('button', { name: m.church_settings_save() }),
      );
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: m.church_settings_slug_confirm_action(),
        }),
      );

      await waitFor(() =>
        expect(slug).toHaveAccessibleDescription(
          m.error_church_settings_slug_taken(),
        ),
      );
    });
  });
});

const SEDE: GetChurchSettings200['addresses'][number] = {
  id: 'a1',
  label: 'Templo',
  street: 'Rua das Flores',
  number: '120',
  complement: null,
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
  cep: null,
  country: 'BR',
  isPublic: true,
  isMain: true,
  latitude: -22.9,
  longitude: -47.06,
  pinSource: 'admin',
  placeId: null,
};
const CASA = {
  ...SEDE,
  id: 'a2',
  label: 'Casa do Marcos',
  street: 'Rua das Acácias',
  isPublic: false,
  isMain: false,
  latitude: null,
  longitude: null,
  pinSource: null,
};

function withAddresses(...addresses: GetChurchSettings200['addresses']) {
  getChurchSettings.mockResolvedValue({ ...SAVED, addresses });
}

async function fillNewAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', {
      name: m.church_settings_address_add(),
    }),
  );
  const dialog = await screen.findByRole('dialog');
  const field = (label: string) =>
    within(dialog).getByRole('textbox', { name: label });
  await user.type(field(m.church_settings_address_label_label()), 'Anexo');
  await user.type(field(m.church_settings_address_street()), 'Avenida Brasil');
  await user.click(
    within(dialog).getByRole('checkbox', {
      name: m.church_settings_address_no_number(),
    }),
  );
  await user.type(field(m.church_settings_address_bairro()), 'Jardim Novo');
  await user.type(field(m.church_settings_address_city()), 'Campinas');
  await user.click(
    within(dialog).getByRole('combobox', {
      name: m.church_settings_address_uf(),
    }),
  );
  await user.click(await screen.findByRole('option', { name: 'SP' }));
  return dialog;
}

describe('Church Settings addresses', () => {
  it('adds the first address by hand as the Main Address, staged into the save bar', async () => {
    const user = userEvent.setup();
    renderSettings();

    const dialog = await fillNewAddress(user);
    expect(
      within(dialog).getByText(m.church_settings_address_home_note()),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('switch', {
        name: new RegExp(m.church_settings_address_public()),
      }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_confirm_add(),
      }),
    );

    expect(saveBar()).toBeInTheDocument();
    expect(
      screen.getByText(m.church_settings_address_main_badge()),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Avenida Brasil, s/n · Jardim Novo · Campinas/SP'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('4');
    expect(updateChurchSettings).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: [
            expect.objectContaining({
              id: null,
              label: 'Anexo',
              street: 'Avenida Brasil',
              number: 's/n',
              uf: 'SP',
              isMain: true,
              isPublic: true,
            }),
          ],
        }),
      ),
    );
  });

  it('counts private addresses as admin-only and summarises the collapsed section', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE, CASA);
    renderSettings();
    await nameField();

    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('4');
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('1');
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(m.church_settings_section_address()),
      }),
    );
    expect(
      screen.getByText(
        m.church_settings_address_summary_many({
          count: 2,
          place: 'Campinas/SP',
        }),
      ),
    ).toBeInTheDocument();
  });

  it('toggles Público, moves the Main role, reorders and edits, all staged', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE, CASA);
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('switch', {
        name: m.church_settings_address_public_toggle({
          name: 'Casa do Marcos',
        }),
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_make_main(),
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_move_up({ name: 'Casa do Marcos' }),
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_edit({ name: 'Templo' }),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    const street = within(dialog).getByRole('textbox', {
      name: m.church_settings_address_street(),
    });
    await user.clear(street);
    await user.type(street, 'Rua Nova');
    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_confirm_edit(),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: [
            expect.objectContaining({ id: 'a2', isPublic: true, isMain: true }),
            expect.objectContaining({
              id: 'a1',
              street: 'Rua Nova',
              isMain: false,
              latitude: -22.9,
              pinSource: 'admin',
            }),
          ],
        }),
      ),
    );
  });

  it('blocks deleting the Main Address while others exist, and allows the last one', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE, CASA);
    renderSettings();
    await nameField();

    expect(
      screen.getByRole('button', {
        name: m.church_settings_address_delete({ name: 'Templo' }),
      }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_delete({ name: 'Casa do Marcos' }),
      }),
    );
    expect(
      screen.getByRole('button', {
        name: m.church_settings_address_delete({ name: 'Templo' }),
      }),
    ).toBeEnabled();
  });

  it('marks the refused row, counts the errors in the section and reopens it', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE, CASA);
    updateChurchSettings.mockRejectedValue(
      refusedSave([
        {
          field: 'addresses.1.street',
          code: 'ADDRESS_REQUIRED',
          message: 'Preencha este campo.',
        },
        {
          field: 'addresses.1.cep',
          code: 'ADDRESS_CEP_INVALID',
          message: 'O CEP deve ter 8 dígitos.',
        },
      ]),
    );
    renderSettings();
    await nameField();
    await user.click(
      screen.getByRole('switch', {
        name: m.church_settings_address_public_toggle({
          name: 'Casa do Marcos',
        }),
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(m.church_settings_section_address()),
      }),
    );

    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    expect(
      await screen.findByText(
        m.church_settings_address_row_errors_many({ count: 2 }),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.church_settings_section_errors_many({ count: 2 })),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_edit({ name: 'Casa do Marcos' }),
      }),
    );
    expect(
      within(await screen.findByRole('dialog')).getByText(
        'O CEP deve ter 8 dígitos.',
      ),
    ).toBeInTheDocument();
  });
});

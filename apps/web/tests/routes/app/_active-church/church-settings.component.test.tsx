import { m } from '@church/i18n/messages';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const getChurchAddressUsage = vi.fn();
const toastSuccess = vi.fn();
const toastPlain = vi.fn();
const uploadChurchLogo = vi.fn();
const removeChurchLogo = vi.fn();
const restoreChurchLogo = vi.fn();

const lookupCep = vi.fn();

vi.mock('@/features/church-settings/cep-client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/church-settings/cep-client')
  >()),
  lookupCep: (...args: unknown[]) => lookupCep(...args),
}));

// The Google widgets never run in tests: the module is faked at its boundary.
const maps = vi.hoisted(() => ({
  enabled: false,
  onPick: undefined as undefined | ((place: unknown) => void),
  onDrag: undefined as undefined | ((pin: unknown) => void),
}));

vi.mock('@/features/church-settings/google-maps', () => ({
  isMapsEnabled: () => maps.enabled,
  attachPlaceSearch: ({ onPick }: { onPick: (place: unknown) => void }) => {
    maps.onPick = onPick;
    return () => undefined;
  },
  mountPinMap: ({ onDrag }: { onDrag: (pin: unknown) => void }) => {
    maps.onDrag = onDrag;
    return { setPin: () => undefined, destroy: () => undefined };
  },
}));

vi.mock('@/utils/api-instances', async () => ({
  churchSettingsApi: {
    getChurchSettings: (...args: unknown[]) => getChurchSettings(...args),
    updateChurchSettings: (...args: unknown[]) => updateChurchSettings(...args),
    getChurchSlugAvailability: (...args: unknown[]) =>
      getChurchSlugAvailability(...args),
    getChurchAddressUsage: (...args: unknown[]) =>
      getChurchAddressUsage(...args),
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
  socialLinks: [],
  logoKey: null,
  logoUrl: null,
  contacts: [],
  contactGroups: [],
  legalProfile: null,
  publicOrigin: 'https://app.church.test',
};

const NO_LEGAL_DRAFT = { legalName: '', cnpj: '', isPublic: false };

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
        socialLinks: [],
        contacts: [],
        contactGroups: [],
        legalProfile: NO_LEGAL_DRAFT,
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
        socialLinks: [],
        contacts: [],
        contactGroups: [],
        legalProfile: NO_LEGAL_DRAFT,
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
          socialLinks: [],
          contacts: [],
          contactGroups: [],
          legalProfile: NO_LEGAL_DRAFT,
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
  async function openNewAddress(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('button', {
        name: m.church_settings_address_add(),
      }),
    );
    return screen.findByRole('dialog');
  }

  async function searchCep(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    typed: string,
  ) {
    await user.type(
      within(dialog).getByRole('textbox', { name: /^CEP/ }),
      typed,
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_cep_lookup(),
      }),
    );
  }

  it('fills the same fields from a CEP and saves only what is confirmed', async () => {
    lookupCep.mockResolvedValue({
      cep: '13015904',
      street: 'Rua Barão de Jaguara',
      bairro: 'Centro',
      city: 'Campinas',
      uf: 'SP',
    });
    const user = userEvent.setup();
    renderSettings();

    const dialog = await openNewAddress(user);
    await searchCep(user, dialog, '13015-904');

    expect(lookupCep).toHaveBeenCalledWith(
      expect.objectContaining({ cep: '13015904' }),
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole('textbox', {
          name: m.church_settings_address_street(),
        }),
      ).toHaveValue('Rua Barão de Jaguara'),
    );
    expect(
      within(dialog).getByRole('textbox', {
        name: m.church_settings_address_bairro(),
      }),
    ).toHaveValue('Centro');
    expect(
      within(dialog).getByRole('textbox', {
        name: m.church_settings_address_city(),
      }),
    ).toHaveValue('Campinas');
    expect(
      within(dialog).getByRole('combobox', {
        name: m.church_settings_address_uf(),
      }),
    ).toHaveTextContent('SP');
    expect(saveBar()).not.toBeInTheDocument();

    const number = within(dialog).getByRole('textbox', {
      name: m.church_settings_address_number(),
    });
    await user.type(number, '100');
    await user.clear(
      within(dialog).getByRole('textbox', {
        name: m.church_settings_address_street(),
      }),
    );
    await user.type(
      within(dialog).getByRole('textbox', {
        name: m.church_settings_address_street(),
      }),
      'Rua Corrigida',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_confirm_add(),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          addresses: [
            expect.objectContaining({
              street: 'Rua Corrigida',
              number: '100',
              bairro: 'Centro',
              city: 'Campinas',
              uf: 'SP',
              cep: '13015904',
            }),
          ],
        }),
      ),
    );
  });

  const PLACE = {
    placeId: 'ChIJ-place',
    street: 'Avenida Brasil',
    number: '500',
    bairro: 'Jardim Novo',
    city: 'Campinas',
    uf: 'SP',
    cep: '13000000',
    latitude: -22.9,
    longitude: -47.06,
  };

  async function saveNewAddress(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
  ) {
    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_confirm_add(),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() => expect(updateChurchSettings).toHaveBeenCalled());
    return updateChurchSettings.mock.calls.at(-1)?.[0].addresses[0];
  }

  it('offers neither search nor map without a Google key, and still saves by CEP', async () => {
    maps.enabled = false;
    lookupCep.mockResolvedValue({
      cep: '13015904',
      street: 'Rua Barão de Jaguara',
      bairro: 'Centro',
      city: 'Campinas',
      uf: 'SP',
    });
    const user = userEvent.setup();
    renderSettings();

    const dialog = await openNewAddress(user);
    expect(
      within(dialog).queryByLabelText(
        m.church_settings_address_google_search(),
      ),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('application')).not.toBeInTheDocument();
    await searchCep(user, dialog, '13015904');
    await user.type(
      await within(dialog).findByRole('textbox', {
        name: m.church_settings_address_number(),
      }),
      '10',
    );
    const saved = await saveNewAddress(user, dialog);
    expect(saved).toEqual(
      expect.objectContaining({
        street: 'Rua Barão de Jaguara',
        cep: '13015904',
      }),
    );
    expect(saved.latitude ?? null).toBeNull();
  });

  describe('with a Google key', () => {
    beforeEach(() => {
      maps.enabled = true;
    });
    afterEach(() => {
      maps.enabled = false;
    });

    it('fills the fields from a picked place and proposes a pin from Google', async () => {
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      expect(within(dialog).getByRole('application')).toBeInTheDocument();

      act(() => maps.onPick?.(PLACE));

      await waitFor(() =>
        expect(
          within(dialog).getByRole('textbox', {
            name: m.church_settings_address_street(),
          }),
        ).toHaveValue('Avenida Brasil'),
      );
      expect(
        within(dialog).getByText(m.church_settings_address_pin_source_google()),
      ).toBeInTheDocument();
      const saved = await saveNewAddress(user, dialog);
      expect(saved).toEqual(
        expect.objectContaining({
          street: 'Avenida Brasil',
          number: '500',
          city: 'Campinas',
          uf: 'SP',
          placeId: 'ChIJ-place',
          latitude: -22.9,
          longitude: -47.06,
          pinSource: 'google',
        }),
      );
    });

    it('stores a confirmed pin as admin data', async () => {
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      act(() => maps.onPick?.(PLACE));
      await user.click(
        await within(dialog).findByRole('button', {
          name: m.church_settings_address_pin_confirm(),
        }),
      );
      const saved = await saveNewAddress(user, dialog);
      expect(saved).toEqual(
        expect.objectContaining({ latitude: -22.9, pinSource: 'admin' }),
      );
    });

    it('stores a dragged pin as admin data', async () => {
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      act(() => maps.onPick?.(PLACE));
      act(() => maps.onDrag?.({ latitude: -22.95, longitude: -47.1 }));
      const saved = await saveNewAddress(user, dialog);
      expect(saved).toEqual(
        expect.objectContaining({
          latitude: -22.95,
          longitude: -47.1,
          pinSource: 'admin',
        }),
      );
    });

    it('saves without a pin when the admin removes it', async () => {
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      act(() => maps.onPick?.(PLACE));
      await user.click(
        await within(dialog).findByRole('button', {
          name: m.church_settings_address_pin_remove(),
        }),
      );
      const saved = await saveNewAddress(user, dialog);
      expect(saved).toEqual(
        expect.objectContaining({
          latitude: null,
          longitude: null,
          pinSource: null,
        }),
      );
    });

    it('proposes a pin with source cep from a CEP that yields coordinates', async () => {
      lookupCep.mockResolvedValue({
        cep: '13015904',
        street: 'Rua Barão de Jaguara',
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
        latitude: -22.9,
        longitude: -47.06,
      });
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      await searchCep(user, dialog, '13015904');
      await user.type(
        await within(dialog).findByRole('textbox', {
          name: m.church_settings_address_number(),
        }),
        '10',
      );
      const saved = await saveNewAddress(user, dialog);
      expect(saved).toEqual(
        expect.objectContaining({
          latitude: -22.9,
          longitude: -47.06,
          pinSource: 'cep',
        }),
      );
    });

    it('drops the place id once street, number or city change', async () => {
      const user = userEvent.setup();
      renderSettings();
      const dialog = await openNewAddress(user);
      act(() => maps.onPick?.(PLACE));
      const city = await within(dialog).findByRole('textbox', {
        name: m.church_settings_address_city(),
      });
      await user.clear(city);
      await user.type(city, 'Valinhos');
      const saved = await saveNewAddress(user, dialog);
      expect(saved.placeId).toBeNull();
    });
  });

  it.each([
    '1301590',
    '1301a904',
  ])('refuses the CEP %j before any lookup', async (typed) => {
    const user = userEvent.setup();
    renderSettings();

    const dialog = await openNewAddress(user);
    await searchCep(user, dialog, typed);

    expect(
      await within(dialog).findByText(m.church_settings_address_cep_invalid()),
    ).toBeInTheDocument();
    expect(lookupCep).not.toHaveBeenCalled();
  });

  it('says so for an unknown CEP and keeps manual entry usable', async () => {
    lookupCep.mockResolvedValue(null);
    const user = userEvent.setup();
    renderSettings();

    const dialog = await openNewAddress(user);
    await searchCep(user, dialog, '99999999');

    expect(
      await within(dialog).findByText(
        m.church_settings_address_cep_not_found(),
      ),
    ).toBeInTheDocument();
    const street = within(dialog).getByRole('textbox', {
      name: m.church_settings_address_street(),
    });
    await user.type(street, 'Rua Manual');
    expect(street).toHaveValue('Rua Manual');
  });

  it('says so when every provider fails and keeps manual entry usable', async () => {
    const { CepLookupFailed } = await import(
      '@/features/church-settings/cep-client'
    );
    lookupCep.mockRejectedValue(new CepLookupFailed());
    const user = userEvent.setup();
    renderSettings();

    const dialog = await openNewAddress(user);
    await searchCep(user, dialog, '13015904');

    expect(
      await within(dialog).findByText(m.church_settings_address_cep_failed()),
    ).toBeInTheDocument();
    const street = within(dialog).getByRole('textbox', {
      name: m.church_settings_address_street(),
    });
    await user.type(street, 'Rua Manual');
    expect(street).toHaveValue('Rua Manual');
  });

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
    getChurchAddressUsage.mockResolvedValue({ templates: [], events: [] });
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
      await screen.findByRole('button', {
        name: m.church_settings_address_delete({ name: 'Templo' }),
      }),
    ).toBeEnabled();
  });

  it('lists where an address in use is used and defaults the replacement to the Main Address', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE, CASA);
    getChurchAddressUsage.mockResolvedValue({
      templates: [{ id: 't1', name: 'Domingo' }],
      events: [
        {
          id: 'e1',
          title: 'Culto de março',
          start: '2099-03-01T22:00:00.000Z',
        },
      ],
    });
    updateChurchSettings.mockResolvedValue({ ...SAVED, addresses: [SEDE] });
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_address_delete({ name: 'Casa do Marcos' }),
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(getChurchAddressUsage).toHaveBeenCalledWith('a2');
    expect(
      within(dialog).getByText(
        m.church_settings_address_in_use_template({ name: 'Domingo' }),
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        m.church_settings_address_in_use_event({ title: 'Culto de março' }),
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('combobox', {
        name: m.church_settings_address_replacement_label(),
      }),
    ).toHaveTextContent('Templo');

    await user.click(
      within(dialog).getByRole('button', {
        name: m.church_settings_address_in_use_confirm(),
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          addressReplacements: [
            { addressId: 'a2', replacementAddressId: 'a1' },
          ],
        }),
      ),
    );
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

const SOCIAL_PRELOADED = [
  {
    url: 'https://instagram.com/semente',
    network: 'instagram',
    description: null,
  },
  {
    url: 'https://youtube.com/@semente',
    network: 'youtube',
    description: 'Cultos',
  },
] as const;

async function addNetwork(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(
    await screen.findByRole('button', { name: m.church_settings_social_add() }),
  );
  await user.click(await screen.findByRole('menuitem', { name: label }));
}

describe('Church Settings social links', () => {
  it('shows a dashed empty state and, from the network menu, pre-fills the address start', async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(
      await screen.findByText(m.church_settings_social_empty()),
    ).toBeInTheDocument();

    await addNetwork(user, 'Instagram');

    expect(screen.getByRole('textbox', { name: 'Link 1' })).toHaveValue(
      'https://instagram.com/',
    );
    expect(screen.getByRole('combobox', { name: 'Rede 1' })).toHaveTextContent(
      'Instagram',
    );
    expect(saveBar()).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Link 1' }), 'semente');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: [
            {
              url: 'https://instagram.com/semente',
              description: '',
              group: null,
            },
          ],
        }),
      ),
    );
  });

  it('keeps the row selector in agreement with the typed URL, and "Colar um link…" starts empty', async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText(m.church_settings_social_empty());

    await addNetwork(user, m.church_settings_social_paste());
    const url = screen.getByRole('textbox', { name: 'Link 1' });
    const network = screen.getByRole('combobox', { name: 'Rede 1' });
    expect(url).toHaveValue('');
    expect(network).toHaveTextContent(
      m.church_settings_social_network_unknown(),
    );

    await user.type(url, 'https://t.me/semente');
    expect(network).toHaveTextContent('Telegram');
    await user.clear(url);
    await user.type(url, 'https://example.com/x');
    expect(network).toHaveTextContent(
      m.church_settings_social_network_unknown(),
    );
    await user.clear(url);
    await user.type(url, 'https://chat.whatsapp.com/abc');
    expect(network).toHaveTextContent('Grupo do WhatsApp');
  });

  it('allows several links on one network with descriptions, and counts them as public', async () => {
    const user = userEvent.setup();
    renderSettings();
    await screen.findByText(m.church_settings_social_empty());

    await addNetwork(user, 'YouTube');
    await addNetwork(user, 'YouTube');
    await user.type(screen.getByRole('textbox', { name: 'Link 1' }), 'igreja');
    await user.type(screen.getByRole('textbox', { name: 'Link 2' }), 'pastor');
    await user.type(
      screen.getByRole('textbox', { name: 'Descrição 2' }),
      'Canal do pastor',
    );

    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('5');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: [
            {
              url: 'https://youtube.com/@igreja',
              description: '',
              group: null,
            },
            {
              url: 'https://youtube.com/@pastor',
              description: 'Canal do pastor',
              group: null,
            },
          ],
        }),
      ),
    );
  });

  it('reorders and deletes with accessible move controls', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({
      ...SAVED,
      socialLinks: SOCIAL_PRELOADED,
    });
    renderSettings();
    await nameField();

    expect(
      screen.getByRole('button', {
        name: m.church_settings_social_move_up({ name: 'Instagram' }),
      }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_social_move_down({ name: 'Instagram' }),
      }),
    );
    expect(
      screen
        .getAllByRole('textbox', { name: /^Link \d$/ })
        .map((i) => (i as HTMLInputElement).value),
    ).toEqual([
      'https://youtube.com/@semente',
      'https://instagram.com/semente',
    ]);

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_social_delete({ name: 'YouTube' }),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: [
            {
              url: 'https://instagram.com/semente',
              description: '',
              group: null,
            },
          ],
        }),
      ),
    );
  });

  it('shows the unsupported-network and wa.me refusals on their rows, counts them and clears on edit', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({
      ...SAVED,
      socialLinks: SOCIAL_PRELOADED,
    });
    updateChurchSettings.mockRejectedValue(
      refusedSave([
        {
          field: 'socialLinks.0.url',
          code: 'SOCIAL_LINK_UNSUPPORTED',
          message: 'Rede não suportada, fale com o suporte.',
        },
        {
          field: 'socialLinks.1.url',
          code: 'SOCIAL_LINK_USE_CONTACT',
          message:
            'Links wa.me são números de telefone: adicione como Contato.',
        },
      ]),
    );
    renderSettings();
    await nameField();
    await user.type(screen.getByRole('textbox', { name: 'Descrição 1' }), ' x');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    expect(
      await screen.findByText('Rede não suportada, fale com o suporte.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Links wa.me são números de telefone: adicione como Contato.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(m.church_settings_section_errors_many({ count: 2 })),
    ).toBeInTheDocument();
  });
});

describe('Church Settings preview addresses', () => {
  const ANEXO = { ...SEDE, id: 'a3', label: 'Anexo', isMain: false };

  afterEach(() => vi.restoreAllMocks());

  async function openPreview(user: ReturnType<typeof userEvent.setup>) {
    await nameField();
    await user.click(
      screen.getByRole('button', { name: m.church_settings_show_preview() }),
    );
    return screen.findByRole('dialog', {
      name: m.church_settings_preview_title(),
    });
  }

  it('lists public addresses with the Main Address first, hides private ones and links Como chegar', async () => {
    const user = userEvent.setup();
    withAddresses(ANEXO, CASA, SEDE);
    renderSettings();

    const drawer = await openPreview(user);

    const labels = within(drawer)
      .getAllByRole('listitem')
      .filter((item) => item.textContent?.includes('Rua das Flores'))
      .map((item) => item.querySelector('p')?.textContent);
    expect(labels).toEqual(['Templo', 'Anexo']);
    expect(within(drawer).queryByText('Casa do Marcos')).toBeNull();
    const links = within(drawer).getAllByRole('link', {
      name: m.church_settings_preview_directions(),
    });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-22.9,-47.06',
    );
  });

  it('picks the link by device', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    );
    withAddresses(SEDE);
    renderSettings();

    const drawer = await openPreview(user);

    expect(
      within(drawer).getByRole('link', {
        name: m.church_settings_preview_directions(),
      }),
    ).toHaveAttribute('href', 'https://maps.apple.com/?daddr=-22.9,-47.06');
  });

  it('copies the formatted address', async () => {
    const user = userEvent.setup();
    withAddresses(SEDE);
    renderSettings();
    const drawer = await openPreview(user);
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue();

    await user.click(
      within(drawer).getByRole('button', {
        name: m.church_settings_preview_copy_address(),
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      'Rua das Flores, 120, Centro, Campinas - SP',
    );
  });
});

describe('Church Contacts section', () => {
  const PHONE = {
    kind: 'phone' as const,
    phoneType: 'mobile' as const,
    value: '+5511987654321',
    description: 'Secretaria',
    isWhatsApp: true,
    isPublic: false,
    group: null,
  };
  const EMAIL = {
    kind: 'email' as const,
    phoneType: null,
    value: 'a@igreja.org',
    description: null,
    isWhatsApp: false,
    isPublic: false,
    group: null,
  };

  function rows() {
    return screen.getAllByTestId('church-contact-row');
  }

  it('adds a private mobile contact with + Contato and saves it in the one request', async () => {
    const user = userEvent.setup();
    renderSettings();
    await nameField();
    expect(screen.getByText(m.church_settings_contacts_empty())).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: m.church_settings_contacts_add() }),
    );
    await user.type(
      within(rows()[0]).getByRole('textbox', {
        name: m.church_settings_contact_phone_label(),
      }),
      '11987654321',
    );
    await user.type(
      within(rows()[0]).getByRole('textbox', {
        name: m.church_settings_contact_description_label(),
      }),
      'Secretaria',
    );
    await user.click(
      within(rows()[0]).getByRole('checkbox', {
        name: m.church_settings_contact_whatsapp(),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          contacts: [
            {
              kind: 'phone',
              phoneType: 'mobile',
              value: '11987654321',
              description: 'Secretaria',
              isWhatsApp: true,
              isPublic: false,
              group: null,
            },
          ],
        }),
      ),
    );
  });

  it('switching the type to email drops the WhatsApp mark option', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({ ...SAVED, contacts: [PHONE] });
    renderSettings();
    await nameField();

    await user.click(
      within(rows()[0]).getByRole('combobox', {
        name: new RegExp(m.church_settings_contact_kind_label()),
      }),
    );
    await user.click(
      await screen.findByRole('option', {
        name: m.church_settings_contact_kind_email(),
      }),
    );

    expect(
      within(rows()[0]).queryByRole('checkbox', {
        name: m.church_settings_contact_whatsapp(),
      }),
    ).not.toBeInTheDocument();
    expect(
      within(rows()[0]).getByRole('textbox', {
        name: m.church_settings_contact_email_label(),
      }),
    ).toBeInTheDocument();
  });

  it('asks before making a contact public and moves the header counts and the preview only on confirm', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({ ...SAVED, contacts: [PHONE] });
    renderSettings();
    await nameField();
    const publicSwitch = within(rows()[0]).getByRole('switch', {
      name: m.church_settings_contact_public(),
    });
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('1');
    expect(
      screen.getByTestId('church-preview-admin-contacts'),
    ).toHaveTextContent('+5511987654321');

    await user.click(publicSwitch);
    await user.click(
      await screen.findByRole('button', {
        name: m.church_settings_contact_public_confirm_cancel(),
      }),
    );
    expect(publicSwitch).not.toBeChecked();
    expect(saveBar()).not.toBeInTheDocument();

    await user.click(publicSwitch);
    await user.click(
      await screen.findByRole('button', {
        name: m.church_settings_contact_public_confirm_action(),
      }),
    );

    expect(publicSwitch).toBeChecked();
    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent('4');
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('0');
    expect(
      screen.getByTestId('church-preview-public-contacts'),
    ).toHaveTextContent('+5511987654321');
  });

  it('making a contact private again needs no confirmation', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({
      ...SAVED,
      contacts: [{ ...PHONE, isPublic: true }],
    });
    renderSettings();
    await nameField();

    await user.click(
      within(rows()[0]).getByRole('switch', {
        name: m.church_settings_contact_public(),
      }),
    );

    expect(
      screen.queryByText(m.church_settings_contact_public_confirm_title()),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('1');
  });

  it('reorders with the move controls and saves the new order', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({
      ...SAVED,
      contacts: [PHONE, EMAIL],
    });
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_contact_move_up({ position: 2 }),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() => expect(updateChurchSettings).toHaveBeenCalled());
    const [{ contacts }] = updateChurchSettings.mock.calls[0];
    expect(contacts.map((c: { kind: string }) => c.kind)).toEqual([
      'email',
      'phone',
    ]);
    expect(
      screen.getByRole('button', {
        name: m.church_settings_contact_move_up({ position: 1 }),
      }),
    ).toBeDisabled();
  });

  it('marks the refused row, opens the section, counts it, and clears it on edit', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue({
      ...SAVED,
      contacts: [PHONE, { ...PHONE, value: '+5511912345678' }],
    });
    updateChurchSettings.mockRejectedValue(
      refusedSave([
        {
          field: 'contacts.1.value',
          code: 'CONTACT_PHONE_INVALID',
          message: 'Informe um telefone brasileiro válido, com DDD.',
        },
      ]),
    );
    renderSettings();
    await nameField();
    const second = () =>
      within(rows()[1]).getByRole('textbox', {
        name: m.church_settings_contact_phone_label(),
      });

    await user.type(second(), '9');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    expect(
      await screen.findByText(
        'Informe um telefone brasileiro válido, com DDD.',
      ),
    ).toBeInTheDocument();
    expect(second()).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(rows()[0]).getByRole('textbox', {
        name: m.church_settings_contact_phone_label(),
      }),
    ).not.toHaveAttribute('aria-invalid');

    await user.type(second(), '0');

    expect(second()).not.toHaveAttribute('aria-invalid');
  });
});

describe('Church Settings legal profile', () => {
  const LEGAL = {
    legalName: 'Igreja Semente Ltda',
    cnpj: '11222333000181',
    isPublic: false,
  };

  it('starts empty with the Público toggle off and counts nothing', async () => {
    renderSettings();

    expect(
      await screen.findByRole('textbox', {
        name: m.church_settings_legal_name_label(),
      }),
    ).toHaveValue('');
    expect(
      screen.getByRole('switch', {
        name: m.church_settings_legal_public_toggle(),
      }),
    ).not.toBeChecked();
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('0');
  });

  it('shows the saved profile with a masked CNPJ and counts it as admin-only', async () => {
    getChurchSettings.mockResolvedValue({ ...SAVED, legalProfile: LEGAL });
    renderSettings();

    expect(
      await screen.findByRole('textbox', {
        name: m.church_settings_legal_cnpj_label(),
      }),
    ).toHaveValue('11.222.333/0001-81');
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('1');
  });

  it('moves the legal profile between the header chips with the Público toggle, and saves it', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.type(
      await screen.findByRole('textbox', {
        name: m.church_settings_legal_name_label(),
      }),
      'Igreja Semente Ltda',
    );
    await user.type(
      screen.getByRole('textbox', {
        name: m.church_settings_legal_cnpj_label(),
      }),
      '11.222.333/0001-81',
    );
    const publicBefore = Number(
      screen.getByTestId('church-settings-public-count').textContent,
    );
    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('1');

    await user.click(
      screen.getByRole('switch', {
        name: m.church_settings_legal_public_toggle(),
      }),
    );

    expect(
      screen.getByTestId('church-settings-admin-only-count'),
    ).toHaveTextContent('0');
    expect(
      screen.getByTestId('church-settings-public-count'),
    ).toHaveTextContent(String(publicBefore + 1));
    expect(
      screen.getByText('CNPJ 11.222.333/0001-81', { exact: false }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          legalProfile: {
            legalName: 'Igreja Semente Ltda',
            cnpj: '11.222.333/0001-81',
            isPublic: true,
          },
        }),
      ),
    );
  });

  it('keeps the legal profile out of the preview while it is private', async () => {
    getChurchSettings.mockResolvedValue({ ...SAVED, legalProfile: LEGAL });
    renderSettings();

    await screen.findByRole('textbox', {
      name: m.church_settings_legal_cnpj_label(),
    });

    expect(screen.queryByText(/CNPJ 11\.222/)).not.toBeInTheDocument();
  });

  it('marks the refused CNPJ, counts it on the section and clears it on edit', async () => {
    const user = userEvent.setup();
    updateChurchSettings.mockRejectedValue(
      refusedSave([
        {
          field: 'legalProfile.cnpj',
          code: 'CNPJ_TAKEN',
          message: 'Este CNPJ já está cadastrado; fale com o suporte.',
        },
      ]),
    );
    renderSettings();
    await user.type(
      await screen.findByRole('textbox', {
        name: m.church_settings_legal_name_label(),
      }),
      'Igreja',
    );
    const cnpj = screen.getByRole('textbox', {
      name: m.church_settings_legal_cnpj_label(),
    });
    await user.type(cnpj, '11222333000181');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    expect(
      await screen.findByText(
        'Este CNPJ já está cadastrado; fale com o suporte.',
      ),
    ).toBeInTheDocument();
    expect(cnpj).toHaveAttribute('aria-invalid', 'true');
    expect(
      within(
        screen.getByRole('button', {
          name: new RegExp(m.church_settings_section_legal()),
        }),
      ).getByText(m.church_settings_section_errors_one()),
    ).toBeInTheDocument();

    await user.type(cnpj, '0');

    expect(cnpj).not.toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Contact Groups', () => {
  const PUBLIC_PHONE = {
    kind: 'phone' as const,
    phoneType: 'mobile' as const,
    value: '+5511987654321',
    description: 'Secretaria',
    isWhatsApp: false,
    isPublic: true,
    group: null,
  };
  const LOUVOR_EMAIL = {
    kind: 'email' as const,
    phoneType: null,
    value: 'louvor@igreja.org',
    description: null,
    isWhatsApp: false,
    isPublic: true,
    group: 'Louvor',
  };
  const HELENA_LINK = {
    url: 'https://instagram.com/helena',
    network: 'instagram' as const,
    description: null,
    group: 'Pastora Helena',
  };
  const GROUPED = {
    ...SAVED,
    contacts: [LOUVOR_EMAIL, PUBLIC_PHONE],
    socialLinks: [HELENA_LINK],
    contactGroups: ['Pastora Helena', 'Louvor'],
  };

  function groupBlocks() {
    return screen.getAllByTestId('church-preview-group');
  }

  it('shows each group with its public contacts and links together, "Da igreja" first', async () => {
    getChurchSettings.mockResolvedValue(GROUPED);
    renderSettings();
    await nameField();

    const [church, helena, louvor] = groupBlocks();
    expect(church).toHaveTextContent(m.church_settings_preview_group_church());
    expect(church).toHaveTextContent('+5511987654321');
    expect(helena).toHaveTextContent('Instagram');
    expect(louvor).toHaveTextContent('louvor@igreja.org');
    expect(groupBlocks()).toHaveLength(3);
  });

  it('suggests existing groups, creates one from a typed name and saves the group of each row', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue(GROUPED);
    renderSettings();
    await nameField();

    const field = screen.getAllByRole('combobox', {
      name: new RegExp(`^${m.church_settings_group_label()} 2$`),
    });
    expect(
      document.querySelectorAll(`option[value="Pastora Helena"]`).length,
    ).toBeGreaterThan(0);
    await user.type(field[0] as HTMLElement, 'Jovens');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          contacts: [
            expect.objectContaining({ group: 'Louvor' }),
            expect.objectContaining({ group: 'Jovens' }),
          ],
          socialLinks: [expect.objectContaining({ group: 'Pastora Helena' })],
          contactGroups: ['Pastora Helena', 'Louvor', 'Jovens'],
        }),
      ),
    );
  });

  it('renames a group from the preview on every member and keeps its place', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue(GROUPED);
    renderSettings();
    await nameField();

    const rename = screen.getByRole('textbox', {
      name: m.church_settings_preview_group_rename({ name: 'Louvor' }),
    });
    await user.clear(rename);
    await user.type(rename, 'Banda{Enter}');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );

    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          contacts: [
            expect.objectContaining({ group: 'Banda' }),
            expect.objectContaining({ group: null }),
          ],
          contactGroups: ['Pastora Helena', 'Banda'],
        }),
      ),
    );
  });

  it('reorders groups from the preview and saves the new order', async () => {
    const user = userEvent.setup();
    getChurchSettings.mockResolvedValue(GROUPED);
    renderSettings();
    await nameField();

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_preview_group_move_down({
          name: 'Pastora Helena',
        }),
      }),
    );

    const [, first, second] = groupBlocks();
    expect(first).toHaveTextContent('louvor@igreja.org');
    expect(second).toHaveTextContent('Instagram');
    await user.click(
      screen.getByRole('button', { name: m.church_settings_save() }),
    );
    await waitFor(() =>
      expect(updateChurchSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          contactGroups: ['Louvor', 'Pastora Helena'],
        }),
      ),
    );
  });
});

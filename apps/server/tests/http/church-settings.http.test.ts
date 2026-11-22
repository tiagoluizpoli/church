import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthorityGuard } from '@/api/auth/authority-guard';
import { ChurchSettingsController } from '@/api/controllers/church-settings-controller';
import { DbAuthorityManager } from '@/application/db-authority-manager';
import { DbChurchSettingsManager } from '@/application/db-church-settings-manager';
import { ChurchId, UserId } from '@/domain/branded-ids';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const CHURCH_B = '22222222-2222-4222-8222-222222222222';
const ADMIN = 'settings-admin';
const PUBLIC_ORIGIN = 'https://app.church.test';

const UNTOUCHED = {
  name: 'Igreja Batista Esperança',
  slug: 'ib-esperanca',
  website: null,
  accentColor: null,
  addresses: [],
  publicOrigin: PUBLIC_ORIGIN,
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controller = new ChurchSettingsController({
    churchSettingsManager: new DbChurchSettingsManager({
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      publicOrigin: PUBLIC_ORIGIN,
    }),
    activeChurchResolver: activeChurchResolver as never,
    authorityGuard: new AuthorityGuard({
      manager: new DbAuthorityManager({
        actorRepository: actorRepository as never,
        scopeRepository: {} as never,
        eventRepository: {} as never,
        eventTimeBlockRepository: {} as never,
        ministryRepository: {} as never,
      }),
    }),
  });
  await app.register(
    async (instance) => {
      instance.register(controller.registerRoutes.bind(controller), {
        prefix: controller.prefix,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.resetAllMocks();
  await truncateAll();
  await buildUser({
    db,
    id: ADMIN,
    name: 'Admin',
    email: 'admin@settings.test',
  });
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja Batista Esperança',
    slug: 'ib-esperanca',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'Church B',
    slug: 'church-b',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurchMembership({
    db,
    churchId: CHURCH_A,
    userId: ADMIN,
    accessLevel: 'admin',
  });
});

type Persona = 'admin' | 'member';

interface SignInInput {
  persona?: Persona;
  churchId?: string;
}

function signIn({ persona = 'admin', churchId = CHURCH_A }: SignInInput = {}) {
  mockGetSession.mockResolvedValue({
    user: { id: ADMIN },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId: UserId.from(ADMIN),
    activeChurchId: ChurchId.from(churchId),
    volunteerId: null,
    churchMembership: {
      churchId: ChurchId.from(churchId),
      accessLevel: persona,
    },
    ministryMemberships: [],
  });
}

function getSettings() {
  return app.inject({ method: 'GET', url: '/api/v1/church-settings' });
}

function saveSettings(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/church-settings',
    payload: { addresses: [], ...payload },
  });
}

describe('Church Settings', () => {
  it('reads the Active Church settings for a ChurchAdmin', async () => {
    signIn();

    const res = await getSettings();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(UNTOUCHED);
  });

  it('saves name, website and accent colour normalised and reads them back', async () => {
    signIn();

    const saved = await saveSettings({
      name: '  Igreja   Batista Esperança Central ',
      website: 'ibesperanca.org.br',
      accentColor: '#1D4ED8',
    });

    const expected = {
      name: 'Igreja Batista Esperança Central',
      slug: 'ib-esperanca',
      website: 'https://ibesperanca.org.br',
      accentColor: '#1d4ed8',
      addresses: [],
      publicOrigin: PUBLIC_ORIGIN,
    };
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual(expected);
    expect((await getSettings()).json()).toEqual(expected);
  });

  it('clears the optional fields back to nothing', async () => {
    signIn();
    await saveSettings({
      name: 'Igreja Batista Esperança',
      website: 'https://ibesperanca.org.br',
      accentColor: '#1d4ed8',
    });

    const res = await saveSettings({
      name: 'Igreja Batista Esperança',
      website: '',
      accentColor: null,
    });

    expect(res.json()).toEqual(UNTOUCHED);
  });

  it('keeps the slug when the Church is renamed', async () => {
    signIn();

    await saveSettings({ name: 'Outro Nome', website: '', accentColor: null });

    expect((await getSettings()).json()).toMatchObject({
      name: 'Outro Nome',
      slug: 'ib-esperanca',
    });
  });

  it('changes only the Active Church', async () => {
    signIn();

    await saveSettings({
      name: 'Outro Nome',
      website: 'a.com',
      accentColor: '#000000',
    });

    signIn({ churchId: CHURCH_B });
    expect((await getSettings()).json()).toEqual({
      name: 'Church B',
      slug: 'church-b',
      website: null,
      accentColor: null,
      addresses: [],
      publicOrigin: PUBLIC_ORIGIN,
    });
  });

  it('refuses a Member who is not a ChurchAdmin both reading and saving', async () => {
    signIn({ persona: 'member' });

    const read = await getSettings();
    const save = await saveSettings({
      name: 'Tomada',
      website: '',
      accentColor: null,
    });

    expect(read.statusCode).toBe(403);
    expect(save.statusCode).toBe(403);
    signIn();
    expect((await getSettings()).json()).toEqual(UNTOUCHED);
  });

  it('changes nothing and answers every refused field when a save fails', async () => {
    signIn();

    const res = await saveSettings({
      name: 'X',
      website: 'http://ibesperanca.org.br',
      accentColor: 'blue',
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: 'VALIDATION_ERROR',
      message: 'Algumas informações enviadas são inválidas.',
      fieldErrors: [
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
        {
          field: 'accentColor',
          code: 'ACCENT_COLOR_INVALID',
          message: 'Escolha uma cor no formato #rrggbb.',
        },
      ],
    });
    expect((await getSettings()).json()).toEqual(UNTOUCHED);
  });

  it('names a missing field instead of saving part of the Church', async () => {
    signIn();

    const res = await saveSettings({ website: 'a.com', accentColor: null });

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      {
        field: 'name',
        code: 'INVALID',
        message: 'Valor inválido.',
      },
    ]);
    expect((await getSettings()).json()).toEqual(UNTOUCHED);
  });
});

const SEDE = {
  label: 'Templo',
  street: 'Rua das Flores',
  number: '120',
  complement: 'Fundos',
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
  cep: '13010-000',
  isPublic: true,
  isMain: true,
};
const ANEXO = {
  label: 'Anexo',
  street: 'Avenida Brasil',
  number: 's/n',
  bairro: 'Jardim Novo',
  city: 'Campinas',
  uf: 'SP',
};

const BASE = {
  name: 'Igreja Batista Esperança',
  website: '',
  accentColor: null,
};

function saveAddresses(addresses: Record<string, unknown>[]) {
  return saveSettings({ ...BASE, addresses });
}

async function readAddresses() {
  signIn();
  return (await getSettings()).json().addresses as Record<string, unknown>[];
}

describe('Church Addresses', () => {
  it('stores addresses in the chosen order, public by default, normalised, in Brazil', async () => {
    signIn();

    const res = await saveAddresses([SEDE, ANEXO]);

    expect(res.statusCode).toBe(200);
    expect(res.json().addresses).toEqual([
      {
        id: expect.any(String),
        label: 'Templo',
        street: 'Rua das Flores',
        number: '120',
        complement: 'Fundos',
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
        cep: '13010000',
        country: 'BR',
        isPublic: true,
        isMain: true,
        latitude: null,
        longitude: null,
        pinSource: null,
        placeId: null,
      },
      expect.objectContaining({
        label: 'Anexo',
        number: 's/n',
        complement: null,
        cep: null,
        isPublic: true,
        isMain: false,
      }),
    ]);
  });

  it('makes the first address added the Main Address even when none is marked', async () => {
    signIn();

    await saveAddresses([{ ...ANEXO }, { ...SEDE, isMain: false }]);

    const rows = await readAddresses();
    expect(rows.map((row) => [row.label, row.isMain])).toEqual([
      ['Anexo', true],
      ['Templo', false],
    ]);
  });

  it('keeps a reordered list in the new order and keeps ids', async () => {
    signIn();
    const [sede, anexo] = (await saveAddresses([SEDE, ANEXO])).json().addresses;

    await saveAddresses([{ ...anexo, isMain: false }, { ...sede }]);

    const rows = await readAddresses();
    expect(rows.map((row) => row.id)).toEqual([anexo.id, sede.id]);
  });

  it('moves the Main Address role, even to a private address', async () => {
    signIn();
    const [sede, anexo] = (await saveAddresses([SEDE, ANEXO])).json().addresses;

    await saveAddresses([
      { ...sede, isMain: false },
      { ...anexo, isMain: true, isPublic: false },
    ]);

    const rows = await readAddresses();
    expect(rows.map((row) => [row.label, row.isMain, row.isPublic])).toEqual([
      ['Templo', false, true],
      ['Anexo', true, false],
    ]);
  });

  it('refuses two Main Addresses', async () => {
    signIn();

    const res = await saveAddresses([SEDE, { ...ANEXO, isMain: true }]);

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({
        field: 'addresses',
        code: 'ADDRESS_MAIN_MULTIPLE',
      }),
    ]);
  });

  it('refuses deleting the Main Address while others remain, and changes nothing', async () => {
    signIn();
    const [, anexo] = (await saveAddresses([SEDE, ANEXO])).json().addresses;

    const res = await saveAddresses([{ ...anexo, isMain: false }]);

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({
        field: 'addresses',
        code: 'ADDRESS_MAIN_REQUIRED',
      }),
    ]);
    expect(await readAddresses()).toHaveLength(2);
  });

  it('deletes the Main Address once another is made main, and when it is the last one', async () => {
    signIn();
    const [, anexo] = (await saveAddresses([SEDE, ANEXO])).json().addresses;

    const handedOver = await saveAddresses([{ ...anexo, isMain: true }]);
    expect(handedOver.statusCode).toBe(200);
    expect(handedOver.json().addresses).toEqual([
      expect.objectContaining({ id: anexo.id, isMain: true }),
    ]);

    const last = await saveAddresses([]);
    expect(last.statusCode).toBe(200);
    expect(last.json().addresses).toEqual([]);
  });

  it('answers each refused field of each row by index', async () => {
    signIn();

    const res = await saveAddresses([
      SEDE,
      {
        street: ' ',
        number: '1',
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'XX',
        cep: '1234',
        country: 'BR',
      },
      { ...ANEXO, country: 'US' },
    ]);

    expect(res.statusCode).toBe(422);
    expect(
      res
        .json()
        .fieldErrors.map((e: { field: string; code: string }) => [
          e.field,
          e.code,
        ]),
    ).toEqual([
      ['addresses.1.street', 'ADDRESS_REQUIRED'],
      ['addresses.1.uf', 'ADDRESS_UF_INVALID'],
      ['addresses.1.cep', 'ADDRESS_CEP_INVALID'],
      ['addresses.2.country', 'INVALID'],
    ]);
    expect(await readAddresses()).toEqual([]);
  });

  it('names a missing address list instead of clearing the addresses', async () => {
    signIn();
    await saveAddresses([SEDE]);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/church-settings',
      payload: BASE,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({ field: 'addresses', code: 'INVALID' }),
    ]);
    expect(await readAddresses()).toHaveLength(1);
  });

  it('refuses an address id that belongs to no address of this Church', async () => {
    signIn();
    await saveAddresses([SEDE]);

    const res = await saveAddresses([
      { ...SEDE, id: '99999999-9999-4999-8999-999999999999' },
    ]);

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({ field: 'addresses.0.id', code: 'INVALID' }),
    ]);
  });

  it('round-trips the pin and drops a place_id once street, number or city change', async () => {
    signIn();
    const pinned = {
      ...SEDE,
      latitude: -22.9,
      longitude: -47.06,
      pinSource: 'google',
      placeId: 'ChIJabc',
    };
    const [first] = (await saveAddresses([pinned])).json().addresses;
    expect(first).toMatchObject({
      latitude: -22.9,
      longitude: -47.06,
      pinSource: 'google',
      placeId: 'ChIJabc',
    });

    const resaved = (await saveAddresses([first])).json().addresses[0];
    expect(resaved.placeId).toBe('ChIJabc');

    const edited = (await saveAddresses([{ ...first, number: '121' }])).json()
      .addresses[0];
    expect(edited).toMatchObject({ number: '121', placeId: null });
    expect(edited).toMatchObject({ latitude: -22.9, pinSource: 'google' });

    const repicked = (
      await saveAddresses([
        { ...edited, street: 'Rua Nova', placeId: 'ChIJnew' },
      ])
    ).json().addresses[0];
    expect(repicked.placeId).toBe('ChIJnew');
  });

  it('refuses a half pin', async () => {
    signIn();

    const res = await saveAddresses([{ ...SEDE, latitude: -22.9 }]);

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({
        field: 'addresses.0.latitude',
        code: 'ADDRESS_PIN_INVALID',
      }),
    ]);
  });

  it('keeps one Church out of another Church’s addresses', async () => {
    signIn();
    await saveAddresses([SEDE]);

    signIn({ churchId: CHURCH_B });

    expect((await getSettings()).json().addresses).toEqual([]);
  });
});

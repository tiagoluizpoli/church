import { eventTimeBlock, templateTimeBlock } from '@church/db';
import { parseInstant, parseTimeOfDay } from '@church/time';
import { eq } from 'drizzle-orm';
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
import { ChurchSlugTakenError } from '@/domain/errors/church-slug-taken';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
} from '@/seeds/builders/scheduling';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

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
  socialLinks: [],
  legalProfile: null,
  logoKey: null,
  logoUrl: null,
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
      objectStorage: new InMemoryObjectStorage(),
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

const NO_LEGAL = { legalName: null, cnpj: null, isPublic: false };

function getSettings() {
  return app.inject({ method: 'GET', url: '/api/v1/church-settings' });
}

function saveSettings(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/church-settings',
    payload: {
      addresses: [],
      socialLinks: [],
      legalProfile: NO_LEGAL,
      ...payload,
    },
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
      socialLinks: [],
      legalProfile: null,
      logoKey: null,
      logoUrl: null,
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
      socialLinks: [],
      legalProfile: null,
      logoKey: null,
      logoUrl: null,
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
      payload: { ...BASE, socialLinks: [], legalProfile: NO_LEGAL },
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

  it('keeps every template and Event time block pointing at an address it edits', async () => {
    signIn();
    const [sede] = (await saveAddresses([SEDE])).json().addresses;
    const { blocks } = await buildEventTemplate({
      db,
      churchId: CHURCH_A,
      name: 'Domingo',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        {
          label: 'Culto',
          startTime: parseTimeOfDay({ value: '19:00' }),
          endTime: parseTimeOfDay({ value: '21:00' }),
          placeAddressId: sede.id,
        },
      ],
    });
    const cycle = await buildCycle({
      db,
      churchId: CHURCH_A,
      name: 'Sent',
      state: 'sent',
      startDate: '2099-01-01' as never,
      endDate: '2099-12-31' as never,
    });
    const planned = await buildEvent({
      db,
      churchId: CHURCH_A,
      cycleId: cycle.id,
      title: 'Culto',
      start: parseInstant({ value: '2099-03-01T22:00:00.000Z' }),
      end: parseInstant({ value: '2099-03-02T00:00:00.000Z' }),
      status: 'scheduled',
    });
    const eventBlock = await buildEventTimeBlock({
      db,
      churchId: CHURCH_A,
      eventId: planned.id,
      start: parseInstant({ value: '2099-03-01T22:00:00.000Z' }),
      end: parseInstant({ value: '2099-03-02T00:00:00.000Z' }),
      placeAddressId: sede.id,
    });

    const saved = await saveAddresses([{ ...sede, street: 'Avenida Nova' }]);

    expect(saved.statusCode).toBe(200);
    const [templateRow] = await db
      .select({ placeAddressId: templateTimeBlock.placeAddressId })
      .from(templateTimeBlock)
      .where(eq(templateTimeBlock.id, blocks[0]?.id ?? ''));
    const [eventRow] = await db
      .select({ placeAddressId: eventTimeBlock.placeAddressId })
      .from(eventTimeBlock)
      .where(eq(eventTimeBlock.id, eventBlock.id));
    expect([templateRow?.placeAddressId, eventRow?.placeAddressId]).toEqual([
      sede.id,
      sede.id,
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

function saveSlug({
  slug,
  churchId,
}: {
  slug: string;
  churchId?: string;
}): ReturnType<typeof saveSettings> {
  signIn({ churchId });
  return saveSettings({
    name: churchId === CHURCH_B ? 'Church B' : 'Igreja Batista Esperança',
    website: '',
    accentColor: null,
    slug,
  });
}

function availability({ slug, churchId }: { slug: string; churchId?: string }) {
  signIn({ churchId });
  return app.inject({
    method: 'GET',
    url: `/api/v1/church-settings/slug-availability?slug=${encodeURIComponent(slug)}`,
  });
}

function slugRefusal(code: string) {
  return expect.objectContaining({
    statusCode: 422,
    body: expect.stringContaining(`"field":"slug","code":"${code}"`),
  });
}

describe('Church Slug', () => {
  it('changes the slug and reads it back', async () => {
    const res = await saveSlug({ slug: 'esperanca' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ...UNTOUCHED, slug: 'esperanca' });
    expect((await getSettings()).json()).toMatchObject({ slug: 'esperanca' });
  });

  it.each([
    ['Igreja Nova', 'CHURCH_SLUG_FORMAT'],
    ['ab', 'CHURCH_SLUG_LENGTH'],
    ['a'.repeat(64), 'CHURCH_SLUG_LENGTH'],
    ['admin', 'CHURCH_SLUG_RESERVED'],
    ['church-b', 'CHURCH_SLUG_TAKEN'],
  ])('refuses %j with %s and changes nothing', async (slug, code) => {
    const res = await saveSlug({ slug });

    expect(res).toEqual(slugRefusal(code));
    expect((await getSettings()).json()).toEqual(UNTOUCHED);
  });

  it('keeps every slug a Church gave up reserved to it, and lets it take one back', async () => {
    await saveSlug({ slug: 'esperanca' });

    expect((await availability({ slug: 'ib-esperanca' })).json()).toEqual({
      status: 'own_history',
    });
    const back = await saveSlug({ slug: 'ib-esperanca' });
    expect(back.statusCode).toBe(200);
    expect(back.json()).toMatchObject({ slug: 'ib-esperanca' });
    expect((await availability({ slug: 'esperanca' })).json()).toEqual({
      status: 'own_history',
    });
  });

  it("refuses a slug in another Church's history", async () => {
    await saveSlug({ slug: 'esperanca' });

    const res = await saveSlug({ slug: 'ib-esperanca', churchId: CHURCH_B });

    expect(res).toEqual(slugRefusal('CHURCH_SLUG_TAKEN'));
    expect(
      (await availability({ slug: 'ib-esperanca', churchId: CHURCH_B })).json(),
    ).toEqual({
      status: 'taken',
    });
  });

  it('answers free, taken, reserved or own history without naming the holder', async () => {
    expect((await availability({ slug: 'livre-agora' })).json()).toEqual({
      status: 'free',
    });
    expect((await availability({ slug: 'church-b' })).json()).toEqual({
      status: 'taken',
    });
    expect((await availability({ slug: 'login' })).json()).toEqual({
      status: 'reserved',
    });
    expect((await availability({ slug: 'ib-esperanca' })).json()).toEqual({
      status: 'free',
    });
  });

  it('answers slug taken, not a server error, when two saves race for the same slug', async () => {
    const repository = new DrizzleChurchRepository({ db });
    const unitOfWork = new DrizzleUnitOfWork({ db });
    const changes = {
      slug: 'raced-slug',
      website: null,
      accentColor: null,
      addresses: [],
      socialLinks: [],
      legalProfile: null,
    };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstWritten!: () => void;
    const written = new Promise<void>((resolve) => {
      firstWritten = resolve;
    });
    // The first save has written the slug but not committed, so the second one's availability check still sees it free.
    const first = unitOfWork.run(async (tx) => {
      await repository.saveSettings({
        id: ChurchId.from(CHURCH_A),
        changes: { ...changes, name: 'Igreja Batista Esperança' },
        tx,
      });
      firstWritten();
      await held;
    });
    await written;
    const second = unitOfWork
      .run((tx) =>
        repository.saveSettings({
          id: ChurchId.from(CHURCH_B),
          changes: { ...changes, name: 'Church B' },
          tx,
        }),
      )
      .then(
        () => null,
        (error: unknown) => error,
      );
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await first;

    expect(await second).toBeInstanceOf(ChurchSlugTakenError);
    expect((await availability({ slug: 'raced-slug' })).json()).toEqual({
      status: 'free',
    });
  });

  it('refuses the availability check to a Member', async () => {
    signIn({ persona: 'member' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/church-settings/slug-availability?slug=livre-agora',
    });

    expect(res.statusCode).toBe(403);
  });
});

function saveSocialLinks(socialLinks: Record<string, unknown>[]) {
  return saveSettings({ ...BASE, socialLinks });
}

async function readSocialLinks() {
  signIn();
  return (await getSettings()).json().socialLinks as Record<string, unknown>[];
}

describe('Social Links', () => {
  it('keeps the links in order, detects each network and allows several per network', async () => {
    signIn();

    const res = await saveSocialLinks([
      { url: 'https://youtube.com/@igreja', description: ' Cultos  ao vivo ' },
      { url: 'instagram.com/igreja' },
      { url: 'https://youtube.com/@pastor', description: 'Canal do pastor' },
      { url: 'https://chat.whatsapp.com/AbC123', description: '  ' },
    ]);

    expect(res.statusCode).toBe(200);
    const expected = [
      {
        url: 'https://youtube.com/@igreja',
        network: 'youtube',
        description: 'Cultos ao vivo',
      },
      {
        url: 'https://instagram.com/igreja',
        network: 'instagram',
        description: null,
      },
      {
        url: 'https://youtube.com/@pastor',
        network: 'youtube',
        description: 'Canal do pastor',
      },
      {
        url: 'https://chat.whatsapp.com/AbC123',
        network: 'whatsappGroup',
        description: null,
      },
    ];
    expect(res.json().socialLinks).toEqual(expected);
    expect(await readSocialLinks()).toEqual(expected);
  });

  it('replaces the stored list, so reordering and removing stick', async () => {
    signIn();
    await saveSocialLinks([
      { url: 'https://instagram.com/a' },
      { url: 'https://t.me/b' },
    ]);

    const res = await saveSocialLinks([{ url: 'https://t.me/b' }]);

    expect(res.json().socialLinks).toEqual([
      { url: 'https://t.me/b', network: 'telegram', description: null },
    ]);
    expect((await saveSocialLinks([])).json().socialLinks).toEqual([]);
  });

  it('answers each refused row by index and saves nothing', async () => {
    signIn();
    await saveSocialLinks([{ url: 'https://instagram.com/keep' }]);

    const res = await saveSocialLinks([
      { url: 'https://instagram.com/ok' },
      { url: 'https://example.com/x' },
      { url: 'https://wa.me/5511999998888' },
      { url: 'not a link' },
      { url: 'https://t.me/ok', description: 'x'.repeat(81) },
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
      ['socialLinks.1.url', 'SOCIAL_LINK_UNSUPPORTED'],
      ['socialLinks.2.url', 'SOCIAL_LINK_USE_CONTACT'],
      ['socialLinks.3.url', 'SOCIAL_LINK_INVALID'],
      ['socialLinks.4.description', 'SOCIAL_LINK_TOO_LONG'],
    ]);
    expect(res.json().fieldErrors[0].message).toBe(
      'Rede não suportada, fale com o suporte.',
    );
    expect(await readSocialLinks()).toEqual([
      {
        url: 'https://instagram.com/keep',
        network: 'instagram',
        description: null,
      },
    ]);
  });

  it('names a missing link list instead of clearing the links', async () => {
    signIn();
    await saveSocialLinks([{ url: 'https://instagram.com/a' }]);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/church-settings',
      payload: { ...BASE, addresses: [], legalProfile: NO_LEGAL },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({ field: 'socialLinks', code: 'INVALID' }),
    ]);
    expect(await readSocialLinks()).toHaveLength(1);
  });

  it('keeps one Church out of the other', async () => {
    signIn();
    await saveSocialLinks([{ url: 'https://instagram.com/a' }]);
    signIn({ churchId: CHURCH_B });

    expect((await getSettings()).json().socialLinks).toEqual([]);
  });
});

const LEGAL = {
  legalName: 'Igreja Batista Esperança Ltda',
  cnpj: '11.222.333/0001-81',
  isPublic: false,
};

function saveLegal(legalProfile: Record<string, unknown>) {
  return saveSettings({ ...BASE, legalProfile });
}

describe('Church Legal Profile', () => {
  it('saves the legal profile with the CNPJ as digits, private by default, and reads it back', async () => {
    signIn();

    const res = await saveLegal({
      ...LEGAL,
      legalName: '  Igreja  Batista Esperança Ltda ',
    });

    const expected = {
      legalName: 'Igreja Batista Esperança Ltda',
      cnpj: '11222333000181',
      isPublic: false,
    };
    expect(res.statusCode).toBe(200);
    expect(res.json().legalProfile).toEqual(expected);
    expect((await getSettings()).json().legalProfile).toEqual(expected);
  });

  it('saves the Público toggle and clears the profile when both fields are blank', async () => {
    signIn();

    const shown = await saveLegal({ ...LEGAL, isPublic: true });
    const cleared = await saveLegal({
      legalName: '',
      cnpj: '',
      isPublic: true,
    });

    expect(shown.json().legalProfile).toMatchObject({ isPublic: true });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().legalProfile).toBeNull();
  });

  it('answers each refused field and saves nothing', async () => {
    signIn();
    await saveLegal(LEGAL);

    const res = await saveLegal({
      legalName: '',
      cnpj: '11.222.333/0001-82',
      isPublic: true,
    });

    expect(res.statusCode).toBe(422);
    expect(
      res
        .json()
        .fieldErrors.map((e: { field: string; code: string }) => [
          e.field,
          e.code,
        ]),
    ).toEqual([
      ['legalProfile.legalName', 'LEGAL_NAME_REQUIRED'],
      ['legalProfile.cnpj', 'CNPJ_INVALID'],
    ]);
    expect((await getSettings()).json().legalProfile).toMatchObject({
      cnpj: '11222333000181',
      isPublic: false,
    });
  });

  it('names a missing legal profile instead of clearing it', async () => {
    signIn();
    await saveLegal(LEGAL);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/church-settings',
      payload: { ...BASE, addresses: [], socialLinks: [] },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      expect.objectContaining({ field: 'legalProfile', code: 'INVALID' }),
    ]);
    expect((await getSettings()).json().legalProfile).not.toBeNull();
  });

  it('answers a generic error, never the other Church, when another Church holds the CNPJ', async () => {
    signIn({ churchId: CHURCH_B });
    await saveLegal({ ...LEGAL, legalName: 'Church B Ltda' });
    signIn();

    const res = await saveLegal(LEGAL);

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      {
        field: 'legalProfile.cnpj',
        code: 'CNPJ_TAKEN',
        message: 'Este CNPJ já está cadastrado; fale com o suporte.',
      },
    ]);
    expect(res.body).not.toMatch(/Church B|church-b|22222222/);
    expect((await getSettings()).json().legalProfile).toBeNull();
  });

  it('lets a Church save its own CNPJ again', async () => {
    signIn();
    await saveLegal(LEGAL);

    const res = await saveLegal({ ...LEGAL, isPublic: true });

    expect(res.statusCode).toBe(200);
    expect(res.json().legalProfile).toMatchObject({ isPublic: true });
  });

  it('keeps one Church out of the other', async () => {
    signIn();
    await saveLegal(LEGAL);
    signIn({ churchId: CHURCH_B });

    expect((await getSettings()).json().legalProfile).toBeNull();
  });
});

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
  logoKey: null,
  logoUrl: null,
  contacts: [],
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

function getSettings() {
  return app.inject({ method: 'GET', url: '/api/v1/church-settings' });
}

function saveSettings(payload: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/church-settings',
    payload,
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
      logoKey: null,
      logoUrl: null,
      contacts: [],
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
      logoKey: null,
      logoUrl: null,
      contacts: [],
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
    const changes = { slug: 'raced-slug', website: null, accentColor: null };
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

describe('Church Contacts', () => {
  const base = {
    name: 'Igreja Batista Esperança',
    website: '',
    accentColor: null,
  };

  const phone = {
    kind: 'phone',
    phoneType: 'mobile',
    value: '(11) 98765-4321',
    description: ' Secretaria ',
    isWhatsApp: true,
    isPublic: true,
  };
  const email = {
    kind: 'email',
    phoneType: null,
    value: 'Contato@Igreja.org',
    description: null,
    isWhatsApp: false,
    isPublic: false,
  };

  it('keeps contacts in order, normalised, and private by what was sent', async () => {
    signIn();

    const saved = await saveSettings({ ...base, contacts: [email, phone] });

    const expected = [
      { ...email, value: 'contato@igreja.org' },
      { ...phone, value: '+5511987654321', description: 'Secretaria' },
    ];
    expect(saved.statusCode).toBe(200);
    expect(saved.json().contacts).toEqual(expected);
    expect((await getSettings()).json().contacts).toEqual(expected);
    await saveSettings({ ...base, contacts: [phone, email] });
    expect(
      (await getSettings())
        .json()
        .contacts.map((c: { kind: string }) => c.kind),
    ).toEqual(['phone', 'email']);
  });

  it('leaves contacts alone when none are sent and clears them with an empty list', async () => {
    signIn();
    await saveSettings({ ...base, contacts: [phone] });

    await saveSettings(base);
    expect((await getSettings()).json().contacts).toHaveLength(1);

    await saveSettings({ ...base, contacts: [] });
    expect((await getSettings()).json().contacts).toEqual([]);
  });

  it('answers an invalid row by its index and saves nothing', async () => {
    signIn();
    await saveSettings({ ...base, contacts: [email] });

    const res = await saveSettings({
      ...base,
      name: 'Novo Nome',
      contacts: [phone, { ...phone, value: '123' }, { ...email, value: 'x' }],
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().fieldErrors).toEqual([
      {
        field: 'contacts.1.value',
        code: 'CONTACT_PHONE_INVALID',
        message: 'Informe um telefone brasileiro válido, com DDD.',
      },
      {
        field: 'contacts.2.value',
        code: 'CONTACT_EMAIL_INVALID',
        message: 'Informe um e-mail válido.',
      },
    ]);
    const after = (await getSettings()).json();
    expect(after.name).toBe('Igreja Batista Esperança');
    expect(after.contacts).toEqual([{ ...email, value: 'contato@igreja.org' }]);
  });

  it('keeps each Church its own contacts', async () => {
    signIn();
    await saveSettings({ ...base, contacts: [phone] });

    signIn({ churchId: CHURCH_B });
    expect((await getSettings()).json().contacts).toEqual([]);
  });
});

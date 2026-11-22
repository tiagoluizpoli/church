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

import { createHash } from 'node:crypto';
import sharp from 'sharp';
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
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';
import { multipartFile } from '@/tests/test-support/multipart';

vi.mock('@/main/di/server-auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

const mockGetSession = vi.mocked(
  (await import('@/main/di/server-auth')).auth.api.getSession,
);

const activeChurchResolver = { resolve: vi.fn() };
const actorRepository = { resolveActor: vi.fn() };

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const ADMIN = 'logo-admin';
const LOGO_PREFIX = `public/churches/${CHURCH_A}/logo/`;

let app: FastifyTypedInstance;
let storage: InMemoryObjectStorage;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  storage = new InMemoryObjectStorage();
  const controller = new ChurchSettingsController({
    churchSettingsManager: new DbChurchSettingsManager({
      churchRepository: new DrizzleChurchRepository({ db }),
      unitOfWork: new DrizzleUnitOfWork({ db }),
      objectStorage: storage,
      publicOrigin: 'https://app.church.test',
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
  storage.objects.clear();
  await truncateAll();
  await buildUser({ db, id: ADMIN, name: 'Admin', email: 'admin@logo.test' });
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja Batista Esperança',
    slug: 'ib-esperanca',
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

function signIn(persona: Persona = 'admin') {
  mockGetSession.mockResolvedValue({
    user: { id: ADMIN },
    session: { activeOrganizationId: null },
  } as never);
  activeChurchResolver.resolve.mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_A,
    volunteerId: null,
    autoSelected: false,
  });
  actorRepository.resolveActor.mockResolvedValue({
    userId: UserId.from(ADMIN),
    activeChurchId: ChurchId.from(CHURCH_A),
    volunteerId: null,
    churchMembership: {
      churchId: ChurchId.from(CHURCH_A),
      accessLevel: persona,
    },
    ministryMemberships: [],
  });
}

type Format = 'png' | 'jpeg' | 'webp' | 'gif' | 'avif' | 'tiff';

interface ImageInput {
  width: number;
  height: number;
  format?: Format;
  color?: string;
}

function image({
  width,
  height,
  format = 'png',
  color = '#1d4ed8',
}: ImageInput): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: color },
  })
    .toFormat(format)
    .toBuffer();
}

interface UploadInput {
  bytes: Buffer;
  filename?: string;
  contentType?: string;
}

function upload({
  bytes,
  filename = 'logo.png',
  contentType = 'image/png',
}: UploadInput) {
  const { payload, headers } = multipartFile({
    field: 'file',
    filename,
    contentType,
    bytes,
  });
  return app.inject({
    method: 'PUT',
    url: '/api/v1/church-settings/logo',
    payload,
    headers,
  });
}

function removeLogo() {
  return app.inject({ method: 'DELETE', url: '/api/v1/church-settings/logo' });
}

function restoreLogo(key: string) {
  return app.inject({
    method: 'PUT',
    url: '/api/v1/church-settings/logo/restore',
    payload: { key },
  });
}

function getSettings() {
  return app.inject({ method: 'GET', url: '/api/v1/church-settings' });
}

/** The one stored object, failing when there is not exactly one. */
function onlyObject() {
  expect(storage.objects.size).toBe(1);
  const [entry] = [...storage.objects];
  if (!entry) throw new Error('no object stored');
  const [key, object] = entry;
  return { key, ...object };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Church logo', () => {
  it.each([
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ] as const)('stores a %s upload as one ≤512 px PNG under its content-hashed key', async (format, contentType) => {
    signIn();

    const res = await upload({
      bytes: await image({ width: 1200, height: 600, format }),
      filename: `logo.${format}`,
      contentType,
    });

    expect(res.statusCode).toBe(200);
    const { key, ...object } = onlyObject();
    expect(key).toBe(`${LOGO_PREFIX}${sha256(object.body)}.png`);
    expect(object.contentType).toBe('image/png');
    expect(object.cacheControl).toBe('public, max-age=31536000, immutable');
    const stored = await sharp(object.body).metadata();
    expect(stored).toMatchObject({ format: 'png', width: 512, height: 256 });
    expect(res.json()).toMatchObject({
      logoKey: key,
      logoUrl: `https://storage.test/church/${key}`,
    });
    expect((await getSettings()).json()).toMatchObject({
      logoKey: key,
      logoUrl: `https://storage.test/church/${key}`,
    });
  });

  it('never upscales a small logo and strips its metadata', async () => {
    signIn();
    const bytes = await sharp({
      create: { width: 200, height: 150, channels: 3, background: '#000' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'Igreja' } } })
      .toBuffer();

    await upload({ bytes, contentType: 'image/jpeg' });

    const object = onlyObject();
    const stored = await sharp(object.body).metadata();
    expect(stored).toMatchObject({ width: 200, height: 150 });
    expect(stored.exif).toBeUndefined();
  });

  it('gives the same image the same key and no new object', async () => {
    signIn();
    const bytes = await image({ width: 300, height: 300 });

    const first = await upload({ bytes });
    const second = await upload({ bytes });

    expect(second.json().logoKey).toBe(first.json().logoKey);
    expect(storage.objects.size).toBe(1);
  });

  it('replaces the logo without deleting the old object', async () => {
    signIn();
    const first = await upload({
      bytes: await image({ width: 300, height: 300 }),
    });

    const second = await upload({
      bytes: await image({ width: 300, height: 300, color: '#ff0000' }),
    });

    expect(second.json().logoKey).not.toBe(first.json().logoKey);
    expect([...storage.objects.keys()].sort()).toEqual(
      [first.json().logoKey, second.json().logoKey].sort(),
    );
    expect((await getSettings()).json().logoKey).toBe(second.json().logoKey);
  });

  it('removes the logo without deleting its object, and restores it', async () => {
    signIn();
    const { logoKey } = (
      await upload({ bytes: await image({ width: 300, height: 300 }) })
    ).json();

    const removed = await removeLogo();

    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ logoKey: null, logoUrl: null });
    expect(storage.objects.has(logoKey)).toBe(true);

    const restored = await restoreLogo(logoKey);

    expect(restored.statusCode).toBe(200);
    expect((await getSettings()).json()).toMatchObject({
      logoKey,
      logoUrl: `https://storage.test/church/${logoKey}`,
    });
  });

  it('refuses to restore a logo key whose object is gone', async () => {
    signIn();
    const missing = `public/churches/${CHURCH_A}/logo/${'a'.repeat(64)}.png`;

    const res = await restoreLogo(missing);

    expect(res.statusCode).toBe(422);
    expect((await getSettings()).json().logoKey).toBeNull();
  });

  it("refuses to restore a key outside the Church's logo folder", async () => {
    signIn();

    const res = await restoreLogo(
      'public/churches/22222222-2222-4222-8222-222222222222/logo/abc.png',
    );

    expect(res.statusCode).toBe(422);
    expect((await getSettings()).json().logoKey).toBeNull();
  });

  describe('refusals', () => {
    it.each([
      [
        'a file over 5 MB',
        async () => ({ bytes: Buffer.alloc(5 * 1024 * 1024 + 1, 1) }),
        413,
        'LOGO_TOO_LARGE',
        'A imagem passa de 5 MB. Envie um arquivo menor.',
      ],
      [
        'a logo whose longest side is under 128 px',
        async () => ({ bytes: await image({ width: 127, height: 100 }) }),
        422,
        'LOGO_TOO_SMALL',
        'A imagem é pequena demais: o lado maior precisa ter pelo menos 128 px.',
      ],
      [
        'a logo wider than 4:1',
        async () => ({ bytes: await image({ width: 801, height: 200 }) }),
        422,
        'LOGO_BAD_ASPECT_RATIO',
        'A imagem é larga ou alta demais: a proporção precisa ficar entre 1:4 e 4:1.',
      ],
      [
        'a logo taller than 1:4',
        async () => ({ bytes: await image({ width: 200, height: 801 }) }),
        422,
        'LOGO_BAD_ASPECT_RATIO',
        'A imagem é larga ou alta demais: a proporção precisa ficar entre 1:4 e 4:1.',
      ],
      [
        'a GIF',
        async () => ({
          bytes: await image({ width: 300, height: 300, format: 'gif' }),
          contentType: 'image/gif',
        }),
        415,
        'LOGO_UNSUPPORTED_TYPE',
        'Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.',
      ],
      [
        'an AVIF',
        async () => ({
          bytes: await image({ width: 300, height: 300, format: 'avif' }),
          contentType: 'image/avif',
        }),
        415,
        'LOGO_UNSUPPORTED_TYPE',
        'Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.',
      ],
      [
        'an SVG disguised as a PNG',
        async () => ({
          bytes: Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300"/></svg>',
          ),
        }),
        415,
        'LOGO_UNSUPPORTED_TYPE',
        'Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.',
      ],
      [
        'a PNG header with no image behind it',
        async () => ({
          bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        }),
        415,
        'LOGO_UNSUPPORTED_TYPE',
        'Formato não aceito. Envie uma imagem PNG, JPEG ou WebP.',
      ],
    ])('refuses %s', async (_label, build, status, error, message) => {
      signIn();

      const res = await upload(await build());

      expect(res.statusCode).toBe(status);
      expect(res.json()).toEqual({ error, message });
      expect(storage.objects.size).toBe(0);
      expect((await getSettings()).json().logoKey).toBeNull();
    });
  });

  it('refuses a Member who is not a ChurchAdmin', async () => {
    signIn('member');
    const bytes = await image({ width: 300, height: 300 });

    const uploaded = await upload({ bytes });
    const removed = await removeLogo();
    const restored = await restoreLogo(`${LOGO_PREFIX}${'a'.repeat(64)}.png`);

    expect(uploaded.statusCode).toBe(403);
    expect(removed.statusCode).toBe(403);
    expect(restored.statusCode).toBe(403);
    expect(storage.objects.size).toBe(0);
  });
});

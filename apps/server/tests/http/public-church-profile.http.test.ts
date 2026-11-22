import { appConfig } from '@church/app-config';
import { church, churchLegalProfile, churchSlugHistory } from '@church/db';
import { parseTimeOfDay } from '@church/time';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicChurchProfileController } from '@/api/controllers/public-church-profile-controller';
import { DbPublicChurchProfileManager } from '@/application/db-public-church-profile-manager';
import { DbPublicEventManager } from '@/application/db-public-event-manager';
import type { ChurchContact } from '@/domain/church-contact';
import type { Recurrence } from '@/domain/recurrence';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleChurchProgrammeRepository } from '@/infrastructure/repositories/drizzle-church-programme.repository';
import { DrizzlePublicEventRepository } from '@/infrastructure/repositories/drizzle-public-event.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import {
  buildChurch,
  buildChurchContactGroups,
  buildChurchContacts,
  buildChurchLegalProfile,
  buildChurchLogo,
  buildChurchSocialLinks,
} from '@/seeds/builders/church';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { insertChurchAddress } from '@/tests/test-support/church-address';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#1d4ed8"/></svg>';
const clock = (value: string) => parseTimeOfDay({ value });
const MAX_REQUESTS = appConfig.publicProfileRateLimit.maxRequests;

let app: FastifyTypedInstance;
let storage: InMemoryObjectStorage;
// Each test reads from its own client IP so the per-IP window never carries over.
let clientIp = 0;
let remoteAddress = '';

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  storage = new InMemoryObjectStorage();
  const controller = new PublicChurchProfileController({
    publicChurchProfileManager: new DbPublicChurchProfileManager({
      churchRepository: new DrizzleChurchRepository({ db }),
      objectStorage: storage,
      programmeRepository: new DrizzleChurchProgrammeRepository({ db }),
    }),
    publicEventManager: new DbPublicEventManager({
      publicEventRepository: new DrizzlePublicEventRepository({ db }),
      churchRepository: new DrizzleChurchRepository({ db }),
    }),
    config: appConfig,
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
  clientIp += 1;
  remoteAddress = `203.0.113.${clientIp}`;
  storage.objects.clear();
  await truncateAll();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja Batista Esperança',
    slug: 'ib-esperanca',
    timezone: 'America/Sao_Paulo',
  });
});

function contact(overrides: Partial<ChurchContact>): ChurchContact {
  return {
    kind: 'email',
    phoneType: null,
    value: 'x@esperanca.test',
    description: null,
    isWhatsApp: false,
    isPublic: true,
    group: null,
    ...overrides,
  };
}

function readProfile(slug: string) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/public/churches/${slug}`,
    remoteAddress,
  });
}

describe('GET /public/churches/:slug', () => {
  it('serves the identity allow-list to a visitor with no session', async () => {
    const response = await readProfile('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: null,
      accentColor: null,
      programme: [],
      contactGroups: [],
      legalProfile: null,
    });
  });

  it('serves the logo URL and accent, and nothing else of the Church', async () => {
    const logoKey = await buildChurchLogo({
      db,
      churchId: CHURCH_A,
      objectStorage: storage,
      svg: LOGO_SVG,
    });
    await db
      .update(church)
      .set({ accentColor: '#1D4ED8', website: 'https://esperanca.test' })
      .where(eq(church.id, CHURCH_A));

    const response = await readProfile('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: storage.publicUrl({ key: logoKey }),
      accentColor: '#1D4ED8',
      programme: [],
      contactGroups: [],
      legalProfile: null,
    });
  });

  it('groups public contacts and links "Da igreja" first, then by group in the admin order, never serving private ones', async () => {
    const groupIds = await buildChurchContactGroups({
      db,
      churchId: CHURCH_A,
      names: ['Pastor João', 'Louvor', 'Vazio'],
    });
    await buildChurchContacts({
      db,
      churchId: CHURCH_A,
      groupIds,
      contacts: [
        contact({ value: 'louvor@esperanca.test', group: 'Louvor' }),
        contact({
          kind: 'phone',
          phoneType: 'mobile',
          value: '+5511999990000',
          isWhatsApp: true,
          group: 'Pastor João',
          description: 'Gabinete',
        }),
        contact({ value: 'segredo@esperanca.test', isPublic: false }),
        contact({
          value: 'privado@esperanca.test',
          group: 'Vazio',
          isPublic: false,
        }),
        contact({ value: 'contato@esperanca.test' }),
      ],
    });
    await buildChurchSocialLinks({
      db,
      churchId: CHURCH_A,
      groupIds,
      socialLinks: [
        { url: 'https://www.instagram.com/louvor', group: 'Louvor' },
        { url: 'https://www.youtube.com/@esperanca', description: 'Cultos' },
      ],
    });

    const response = await readProfile('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.json().contactGroups).toEqual([
      {
        name: null,
        contacts: [
          {
            kind: 'email',
            phoneType: null,
            value: 'contato@esperanca.test',
            description: null,
            isWhatsApp: false,
          },
        ],
        socialLinks: [
          {
            url: 'https://www.youtube.com/@esperanca',
            network: 'youtube',
            description: 'Cultos',
          },
        ],
      },
      {
        name: 'Pastor João',
        contacts: [
          {
            kind: 'phone',
            phoneType: 'mobile',
            value: '+5511999990000',
            description: 'Gabinete',
            isWhatsApp: true,
          },
        ],
        socialLinks: [],
      },
      {
        name: 'Louvor',
        contacts: [
          {
            kind: 'email',
            phoneType: null,
            value: 'louvor@esperanca.test',
            description: null,
            isWhatsApp: false,
          },
        ],
        socialLinks: [
          {
            url: 'https://www.instagram.com/louvor',
            network: 'instagram',
            description: null,
          },
        ],
      },
    ]);
    expect(response.body).not.toContain('segredo@');
    expect(response.body).not.toContain('privado@');
  });

  it('serves no contact group when every contact is private', async () => {
    await buildChurchContacts({
      db,
      churchId: CHURCH_A,
      groupIds: new Map(),
      contacts: [contact({ value: 'segredo@esperanca.test', isPublic: false })],
    });

    const response = await readProfile('ib-esperanca');

    expect(response.json().contactGroups).toEqual([]);
  });

  it('serves the legal name and CNPJ only when the legal profile is public', async () => {
    await buildChurchLegalProfile({
      db,
      churchId: CHURCH_A,
      legalProfile: {
        legalName: 'Igreja Batista Esperança LTDA',
        cnpj: '11222333000181',
        isPublic: false,
      },
    });

    const hidden = await readProfile('ib-esperanca');
    expect(hidden.json().legalProfile).toBeNull();
    expect(hidden.body).not.toContain('11222333000181');

    await db
      .update(churchLegalProfile)
      .set({ isPublic: true })
      .where(eq(churchLegalProfile.churchId, CHURCH_A));

    const shown = await readProfile('ib-esperanca');
    expect(shown.json().legalProfile).toEqual({
      legalName: 'Igreja Batista Esperança LTDA',
      cnpj: '11222333000181',
    });
  });

  it('answers an old slug with the current slug', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'esperanca-antiga', churchId: CHURCH_A });

    const response = await readProfile('esperanca-antiga');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      slug: 'ib-esperanca',
      name: 'Igreja Batista Esperança',
      logoUrl: null,
      accentColor: null,
      programme: [],
      contactGroups: [],
      legalProfile: null,
    });
  });

  it('answers an unknown slug with 404', async () => {
    const response = await readProfile('nao-existe');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'NOT_FOUND',
      message: 'Não encontramos o que você pediu.',
    });
  });

  it('answers 429 once a client IP is over the limit', async () => {
    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      expect((await readProfile('ib-esperanca')).statusCode).toBe(200);
    }

    const limited = await readProfile('ib-esperanca');

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: 'RATE_LIMITED',
      message: 'Muitas tentativas. Tente novamente em instantes.',
    });
    remoteAddress = '198.51.100.1';
    expect((await readProfile('ib-esperanca')).statusCode).toBe(200);
  });

  describe('programme', () => {
    const SUNDAY = { kind: 'weekly', weekdays: [0] } satisfies Recurrence;

    async function programmeOf(slug: string) {
      const response = await readProfile(slug);
      expect(response.statusCode).toBe(200);
      return response.json().programme;
    }

    it('serves the public blocks in the read model order and never a private one', async () => {
      await buildEventTemplate({
        db,
        churchId: CHURCH_A,
        name: 'Quarta',
        recurrence: { kind: 'weekly', weekdays: [3] },
        blocks: [
          {
            label: 'Oração',
            startTime: clock('20:00'),
            endTime: clock('21:00'),
            isPublic: true,
          },
        ],
      });
      await buildEventTemplate({
        db,
        churchId: CHURCH_A,
        name: 'Domingo',
        recurrence: SUNDAY,
        blocks: [
          {
            label: 'Culto',
            startTime: clock('19:00'),
            endTime: clock('21:00'),
            isPublic: true,
          },
          {
            label: 'Ensaio',
            startTime: clock('16:00'),
            endTime: clock('17:00'),
            isPublic: false,
          },
        ],
      });

      expect(await programmeOf('ib-esperanca')).toEqual([
        {
          recurrence: SUNDAY,
          exceptOrdinals: [],
          startTime: clock('19:00'),
          label: 'Culto',
          place: null,
        },
        {
          recurrence: { kind: 'weekly', weekdays: [3] },
          exceptOrdinals: [],
          startTime: clock('20:00'),
          label: 'Oração',
          place: null,
        },
      ]);
    });

    it('names the place of a free-text place or another Church Address, never the Main Address', async () => {
      const main = await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Templo',
      });
      const hall = await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Salão anexo',
        isMain: false,
        position: 1,
      });
      await buildEventTemplate({
        db,
        churchId: CHURCH_A,
        name: 'Domingo',
        recurrence: SUNDAY,
        blocks: [
          {
            label: 'A',
            startTime: clock('08:00'),
            endTime: clock('09:00'),
            isPublic: true,
            placeAddressId: main,
          },
          {
            label: 'B',
            startTime: clock('09:00'),
            endTime: clock('10:00'),
            isPublic: true,
            placeAddressId: hall,
          },
          {
            label: 'C',
            startTime: clock('10:00'),
            endTime: clock('11:00'),
            isPublic: true,
            place: 'Praça central',
          },
        ],
      });

      const programme = await programmeOf('ib-esperanca');

      expect(
        programme.map((a: { label: string; place: string | null }) => [
          a.label,
          a.place,
        ]),
      ).toEqual([
        ['A', null],
        ['B', 'Salão anexo'],
        ['C', 'Praça central'],
      ]);
    });

    it('serves an empty programme when the Church has no Regular Activity', async () => {
      await buildEventTemplate({
        db,
        churchId: CHURCH_A,
        name: 'Domingo',
        recurrence: SUNDAY,
        blocks: [
          {
            label: 'Ensaio',
            startTime: clock('16:00'),
            endTime: clock('17:00'),
            isPublic: false,
          },
        ],
      });

      expect(await programmeOf('ib-esperanca')).toEqual([]);
    });
  });
});

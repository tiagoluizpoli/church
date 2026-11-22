import { appConfig } from '@church/app-config';
import {
  church,
  churchLegalProfile,
  churchSlugHistory,
  organization,
} from '@church/db';
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
const WEB_ORIGIN = 'https://igreja.example';
const SPA_SHELL =
  '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8" /><title>Church</title><script type="module" src="/assets/index-abc.js"></script></head><body><div id="app"></div></body></html>';

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
    webShell: {
      publicOrigin: WEB_ORIGIN,
      readIndexHtml: async () => SPA_SHELL,
    },
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
      addresses: [],
      mainAddressArea: null,
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
      addresses: [],
      mainAddressArea: null,
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
      addresses: [],
      mainAddressArea: null,
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

  describe('addresses', () => {
    async function readBody() {
      return (await readProfile('ib-esperanca')).json();
    }

    it('serves public addresses Main first with an allow-list of fields, never a private one', async () => {
      await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Sede',
        street: 'Rua Principal',
        isMain: true,
        position: 1,
      });
      await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Anexo',
        street: 'Rua Anexo',
        isMain: false,
        position: 0,
      });
      await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Casa do pastor',
        street: 'Rua Secreta',
        isMain: false,
        isPublic: false,
        position: 2,
      });

      const body = await readBody();

      expect(body.addresses).toEqual([
        {
          label: 'Sede',
          street: 'Rua Principal',
          number: '10',
          complement: null,
          bairro: 'Centro',
          city: 'Campinas',
          uf: 'SP',
          cep: null,
          latitude: null,
          longitude: null,
          placeId: null,
          isMain: true,
        },
        expect.objectContaining({ label: 'Anexo', isMain: false }),
      ]);
      expect(JSON.stringify(body)).not.toContain('Rua Secreta');
    });

    it('carries only bairro and city/UF of a private Main Address', async () => {
      await insertChurchAddress({
        db,
        churchId: CHURCH_A,
        label: 'Casa do pastor',
        street: 'Rua Secreta',
        isMain: true,
        isPublic: false,
      });

      const body = await readBody();

      expect(body.addresses).toEqual([]);
      expect(body.mainAddressArea).toEqual({
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
      });
      expect(JSON.stringify(body)).not.toContain('Rua Secreta');
    });

    it('serves the Main Address area when it is public too', async () => {
      await insertChurchAddress({ db, churchId: CHURCH_A });

      expect((await readBody()).mainAddressArea).toEqual({
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
      });
    });
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

describe('GET /public/churches/:slug/page', () => {
  function readPage(slug: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/api/v1/public/churches/${slug}/page${query}`,
      remoteAddress,
    });
  }

  function shellWithHead(head: string[]): string {
    return SPA_SHELL.replace('<title>Church</title>', () => head.join(''));
  }

  it('fills the head with the name, Main Address city/UF, canonical and the logo as image', async () => {
    const logoKey = await buildChurchLogo({
      db,
      churchId: CHURCH_A,
      objectStorage: storage,
      svg: LOGO_SVG,
    });
    await insertChurchAddress({ db, churchId: CHURCH_A, isPublic: false });
    const logoUrl = storage.publicUrl({ key: logoKey });

    const response = await readPage('ib-esperanca');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.body).toBe(
      shellWithHead([
        '<title>Igreja Batista Esperança | Church</title>',
        '<meta name="description" content="Igreja Batista Esperança · Campinas/SP" />',
        '<link rel="canonical" href="https://igreja.example/ib-esperanca" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:url" content="https://igreja.example/ib-esperanca" />',
        '<meta property="og:title" content="Igreja Batista Esperança | Church" />',
        '<meta property="og:description" content="Igreja Batista Esperança · Campinas/SP" />',
        `<meta property="og:image" content="${logoUrl}" />`,
        '<meta name="twitter:card" content="summary" />',
        '<meta name="twitter:title" content="Igreja Batista Esperança | Church" />',
        '<meta name="twitter:description" content="Igreja Batista Esperança · Campinas/SP" />',
        `<meta name="twitter:image" content="${logoUrl}" />`,
      ]),
    );
  });

  it('describes a Church with no Main Address by its name, with the platform logo, escaping the name', async () => {
    await db
      .update(organization)
      .set({ name: 'Igreja "Luz" & <Paz> $&' })
      .where(eq(organization.id, CHURCH_A));

    const response = await readPage('ib-esperanca');

    const name = 'Igreja &quot;Luz&quot; &amp; &lt;Paz&gt; $&amp;';
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(
      shellWithHead([
        `<title>${name} | Church</title>`,
        `<meta name="description" content="${name}" />`,
        '<link rel="canonical" href="https://igreja.example/ib-esperanca" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:url" content="https://igreja.example/ib-esperanca" />',
        `<meta property="og:title" content="${name} | Church" />`,
        `<meta property="og:description" content="${name}" />`,
        '<meta property="og:image" content="https://igreja.example/logo.png" />',
        '<meta name="twitter:card" content="summary" />',
        `<meta name="twitter:title" content="${name} | Church" />`,
        `<meta name="twitter:description" content="${name}" />`,
        '<meta name="twitter:image" content="https://igreja.example/logo.png" />',
      ]),
    );
  });

  it('answers an old slug with a 301 to the current slug', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'esperanca-antiga', churchId: CHURCH_A });

    const response = await readPage('esperanca-antiga');

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe('/ib-esperanca');
  });

  it('keeps the query string of an old printed or shared link on the 301', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'esperanca-antiga', churchId: CHURCH_A });

    const response = await readPage(
      'esperanca-antiga',
      '?utm_source=folheto&x=1',
    );

    expect(response.statusCode).toBe(301);
    expect(response.headers.location).toBe(
      '/ib-esperanca?utm_source=folheto&x=1',
    );
  });

  it.each([
    'nao-existe',
    'login',
  ])('answers %s with 404 and the unfilled SPA shell', async (slug) => {
    const response = await readPage(slug);

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.body).toBe(SPA_SHELL);
  });

  it('answers 429 with the unfilled SPA shell once a client IP is over the limit', async () => {
    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      expect((await readPage('ib-esperanca')).statusCode).toBe(200);
    }

    const limited = await readPage('ib-esperanca');

    expect(limited.statusCode).toBe(429);
    expect(limited.body).toBe(SPA_SHELL);
  });
});

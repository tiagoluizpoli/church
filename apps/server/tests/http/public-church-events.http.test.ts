import { appConfig } from '@church/app-config';
import {
  churchAddress,
  churchSlugHistory,
  event,
  eventTimeBlock,
} from '@church/db';
import { parseInstant } from '@church/time';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PublicChurchProfileController } from '@/api/controllers/public-church-profile-controller';
import { DbPublicChurchProfileManager } from '@/application/db-public-church-profile-manager';
import { DbPublicEventManager } from '@/application/db-public-event-manager';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleChurchProgrammeRepository } from '@/infrastructure/repositories/drizzle-church-programme.repository';
import { DrizzlePublicEventRepository } from '@/infrastructure/repositories/drizzle-public-event.repository';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { buildChurch } from '@/seeds/builders/church';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildEventTimeBlockMove,
} from '@/seeds/builders/scheduling';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';
import { insertChurchAddress } from '@/tests/test-support/church-address';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const PAGE_SIZE = 20;
const MAX_REQUESTS = appConfig.publicProfileRateLimit.maxRequests;
// Far enough ahead that every event is upcoming whenever the suite runs.
const at = (value: string) => parseInstant({ value: `${value}:00.000Z` });

let app: FastifyTypedInstance;
let clientIp = 0;
let remoteAddress = '';
let sentCycleId: string;
let draftCycleId: string;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const churchRepository = new DrizzleChurchRepository({ db });
  const controller = new PublicChurchProfileController({
    publicChurchProfileManager: new DbPublicChurchProfileManager({
      churchRepository,
      objectStorage: new InMemoryObjectStorage(),
      programmeRepository: new DrizzleChurchProgrammeRepository({ db }),
    }),
    publicEventManager: new DbPublicEventManager({
      publicEventRepository: new DrizzlePublicEventRepository({ db }),
      churchRepository,
    }),
    webShell: {
      publicOrigin: 'https://igreja.example',
      readIndexHtml: async () => '<!doctype html>',
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
  await truncateAll();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja Batista Esperança',
    slug: 'ib-esperanca',
    timezone: 'America/Sao_Paulo',
  });
  sentCycleId = (
    await buildCycle({
      db,
      churchId: CHURCH_A,
      name: 'Sent',
      state: 'sent',
      startDate: '2099-01-01' as never,
      endDate: '2099-12-31' as never,
    })
  ).id;
  draftCycleId = (
    await buildCycle({
      db,
      churchId: CHURCH_A,
      name: 'Draft',
      state: 'draft',
      startDate: '2100-01-01' as never,
      endDate: '2100-12-31' as never,
    })
  ).id;
});

interface SeedEventInput {
  title: string;
  start: string;
  cycleId?: string;
  isPublic?: boolean;
  status?: 'draft' | 'scheduled';
}

async function seedEvent({
  title,
  start,
  cycleId,
  isPublic = true,
  status = 'scheduled',
}: SeedEventInput) {
  const end = `${start.slice(0, 11)}23:00`;
  const created = await buildEvent({
    db,
    churchId: CHURCH_A,
    cycleId: cycleId ?? sentCycleId,
    title,
    start: at(start),
    end: at(end),
    status,
  });
  const block = await buildEventTimeBlock({
    db,
    churchId: CHURCH_A,
    eventId: created.id,
    start: at(start),
    end: at(end),
    label: 'Culto',
    isPublic,
    place: 'Templo',
  });
  return { event: created, block };
}

function readEvents({ slug, cursor }: { slug: string; cursor?: string }) {
  return app.inject({
    method: 'GET',
    url: `/api/v1/public/churches/${slug}/events`,
    query: cursor ? { cursor } : undefined,
    remoteAddress,
  });
}

interface CancelInput {
  id: string;
}

async function cancelEvent({ id }: CancelInput) {
  await db.update(event).set({ status: 'cancelled' }).where(eq(event.id, id));
}

async function cancelBlock({ id }: CancelInput) {
  await db
    .update(eventTimeBlock)
    .set({ status: 'cancelled' })
    .where(eq(eventTimeBlock.id, id));
}

interface SetHiddenInput {
  id: string;
  isHidden: boolean;
}

async function setEventHidden({ id, isHidden }: SetHiddenInput) {
  await db.update(event).set({ isHidden }).where(eq(event.id, id));
}

async function setBlockHidden({ id, isHidden }: SetHiddenInput) {
  await db
    .update(eventTimeBlock)
    .set({ isHidden })
    .where(eq(eventTimeBlock.id, id));
}

interface AddBlockInput {
  eventId: string;
  label: string;
  start: string;
  isPublic?: boolean;
}

function addBlock({ eventId, label, start, isPublic = true }: AddBlockInput) {
  return buildEventTimeBlock({
    db,
    churchId: CHURCH_A,
    eventId,
    start: at(start),
    end: at(`${start.slice(0, 11)}23:00`),
    label,
    isPublic,
    place: 'Templo',
  });
}

interface ShownEvent {
  title: string;
  cancelled: boolean;
  blocks: { label: string; cancelled: boolean }[];
}

/** What a visitor sees: each Event and block with its cancelled mark. */
async function readShown() {
  const response = await readEvents({ slug: 'ib-esperanca' });
  expect(response.statusCode).toBe(200);
  const { items } = response.json<{ items: ShownEvent[] }>();
  return items.map((item) => ({
    title: item.title,
    cancelled: item.cancelled,
    blocks: item.blocks.map(({ label, cancelled }) => ({ label, cancelled })),
  }));
}

describe('GET /public/churches/:slug/events', () => {
  it('serves only allow-listed public fields without a session', async () => {
    await seedEvent({ title: 'Culto de domingo', start: '2099-03-01T13:00' });

    const response = await readEvents({ slug: 'ib-esperanca' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      timezone: 'America/Sao_Paulo',
      items: [
        {
          title: 'Culto de domingo',
          cancelled: false,
          start: '2099-03-01T13:00:00.000Z',
          blocks: [
            {
              label: 'Culto',
              start: '2099-03-01T13:00:00.000Z',
              end: '2099-03-01T23:00:00.000Z',
              place: 'Templo',
              cancelled: false,
              movePath: [],
            },
          ],
        },
      ],
    });
  });

  it('leaves out Draft Cycle Events and private blocks', async () => {
    await seedEvent({ title: 'Publico', start: '2099-03-01T13:00' });
    await seedEvent({
      title: 'Rascunho',
      start: '2099-03-02T13:00',
      cycleId: draftCycleId,
    });
    await seedEvent({
      title: 'Interno',
      start: '2099-03-03T13:00',
      isPublic: false,
    });

    const { items } = (await readEvents({ slug: 'ib-esperanca' })).json();

    expect(items.map((item: { title: string }) => item.title)).toEqual([
      'Publico',
    ]);
  });

  it('leaves out an Event reopened to draft inside a Sent Cycle', async () => {
    await seedEvent({ title: 'Publico', start: '2099-03-01T13:00' });
    await seedEvent({
      title: 'Reaberto',
      start: '2099-03-02T13:00',
      status: 'draft',
    });

    const { items } = (await readEvents({ slug: 'ib-esperanca' })).json();

    expect(items.map((item: { title: string }) => item.title)).toEqual([
      'Publico',
    ]);
  });

  it('breaks a tie on start by id, across pages', async () => {
    const seeded: { id: string; title: string }[] = [];
    for (let index = 0; index < PAGE_SIZE + 1; index += 1) {
      const title = `Evento ${index}`;
      const { event } = await seedEvent({ title, start: '2099-03-01T13:00' });
      seeded.push({ id: event.id, title });
    }
    const byId = seeded
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .map(({ title }) => title);

    const first = (await readEvents({ slug: 'ib-esperanca' })).json();
    const second = (
      await readEvents({ slug: 'ib-esperanca', cursor: first.nextCursor })
    ).json();

    const titles = [...first.items, ...second.items].map(
      (item: { title: string }) => item.title,
    );
    expect(titles).toEqual(byId);
  });

  it('pages 20 at a time ordered by start then id', async () => {
    for (let index = 0; index < PAGE_SIZE + 1; index += 1) {
      const day = String(index + 1).padStart(2, '0');
      await seedEvent({
        title: `Evento ${day}`,
        start: `2099-03-${day}T13:00`,
      });
    }

    const first = (await readEvents({ slug: 'ib-esperanca' })).json();
    expect(first.items).toHaveLength(PAGE_SIZE);
    expect(first.items[0].title).toBe('Evento 01');
    expect(typeof first.nextCursor).toBe('string');

    const second = (
      await readEvents({ slug: 'ib-esperanca', cursor: first.nextCursor })
    ).json();
    expect(second.items.map((item: { title: string }) => item.title)).toEqual([
      'Evento 21',
    ]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('serves a moved block with its path', async () => {
    const { block } = await seedEvent({
      title: 'Culto',
      start: '2099-03-01T14:00',
    });
    await buildEventTimeBlockMove({
      db,
      churchId: CHURCH_A,
      eventTimeBlockId: block.id,
      previousStart: at('2099-03-01T13:00'),
      previousEnd: at('2099-03-01T23:00'),
      newStart: at('2099-03-01T14:00'),
      newEnd: at('2099-03-01T23:00'),
    });

    const { items } = (await readEvents({ slug: 'ib-esperanca' })).json();

    expect(items[0].blocks[0].movePath).toEqual([
      { start: '2099-03-01T13:00:00.000Z', end: '2099-03-01T23:00:00.000Z' },
      { start: '2099-03-01T14:00:00.000Z', end: '2099-03-01T23:00:00.000Z' },
    ]);
  });

  it('shows a Church Address place as it reads now, and only bairro and city of a private one', async () => {
    const templo = await insertChurchAddress({
      db,
      churchId: CHURCH_A,
      label: null,
    });
    const casa = await insertChurchAddress({
      db,
      churchId: CHURCH_A,
      label: null,
      street: 'Rua da Casa',
      isPublic: false,
      isMain: false,
      position: 1,
    });
    const first = await seedEvent({
      title: 'Culto',
      start: '2099-03-01T13:00',
    });
    const second = await seedEvent({
      title: 'Célula',
      start: '2099-03-02T13:00',
    });
    await db
      .update(eventTimeBlock)
      .set({ place: null, placeAddressId: templo })
      .where(eq(eventTimeBlock.id, first.block.id));
    await db
      .update(eventTimeBlock)
      .set({ place: null, placeAddressId: casa })
      .where(eq(eventTimeBlock.id, second.block.id));
    await db
      .update(churchAddress)
      .set({ street: 'Avenida Nova', number: '200' })
      .where(eq(churchAddress.id, templo));

    const { items } = (await readEvents({ slug: 'ib-esperanca' })).json();

    expect(
      items.map(
        (item: { blocks: { place: string }[] }) => item.blocks[0]?.place,
      ),
    ).toEqual([
      'Avenida Nova, 200 · Centro · Campinas/SP',
      'Centro · Campinas/SP',
    ]);
  });

  it('answers an old slug like the current one and an unknown slug 404', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'esperanca-antiga', churchId: CHURCH_A });
    await seedEvent({ title: 'Culto', start: '2099-03-01T13:00' });

    const old = await readEvents({ slug: 'esperanca-antiga' });
    const unknown = await readEvents({ slug: 'nao-existe' });

    expect(old.statusCode).toBe(200);
    expect(old.json().items).toHaveLength(1);
    expect(unknown.statusCode).toBe(404);
  });

  it('shows a cancelled Event as cancelled until its start passes', async () => {
    const upcoming = await seedEvent({
      title: 'Futuro',
      start: '2099-03-01T13:00',
    });
    const started = await seedEvent({
      title: 'Passado',
      start: '2020-03-01T13:00',
    });
    await cancelEvent({ id: upcoming.event.id });
    await cancelEvent({ id: started.event.id });

    expect(await readShown()).toEqual([
      {
        title: 'Futuro',
        cancelled: true,
        blocks: [{ label: 'Culto', cancelled: true }],
      },
    ]);
  });

  it('marks the Event cancelled only once every public block is', async () => {
    const partly = await seedEvent({
      title: 'Parcial',
      start: '2099-03-01T13:00',
    });
    await addBlock({
      eventId: partly.event.id,
      label: 'Noite',
      start: '2099-03-01T20:00',
    });
    const whole = await seedEvent({
      title: 'Inteiro',
      start: '2099-03-02T13:00',
    });
    await cancelBlock({ id: partly.block.id });
    await cancelBlock({ id: whole.block.id });

    expect(await readShown()).toEqual([
      {
        title: 'Parcial',
        cancelled: false,
        blocks: [
          { label: 'Culto', cancelled: true },
          { label: 'Noite', cancelled: false },
        ],
      },
      {
        title: 'Inteiro',
        cancelled: true,
        blocks: [{ label: 'Culto', cancelled: true }],
      },
    ]);
  });

  it('leaves out a hidden cancelled Event, and shows it again as cancelled', async () => {
    const { event: hidden } = await seedEvent({
      title: 'Oculto',
      start: '2099-03-01T13:00',
    });
    await cancelEvent({ id: hidden.id });
    await setEventHidden({ id: hidden.id, isHidden: true });

    expect(await readShown()).toEqual([]);

    await setEventHidden({ id: hidden.id, isHidden: false });

    expect(await readShown()).toEqual([
      {
        title: 'Oculto',
        cancelled: true,
        blocks: [{ label: 'Culto', cancelled: true }],
      },
    ]);
  });

  it('drops an Event kept on view by cancelled blocks once they are hidden', async () => {
    const { event: kept, block } = await seedEvent({
      title: 'Vigília',
      start: '2099-03-01T13:00',
    });
    await addBlock({
      eventId: kept.id,
      label: 'Interno',
      start: '2099-03-01T20:00',
      isPublic: false,
    });
    await cancelBlock({ id: block.id });
    await setBlockHidden({ id: block.id, isHidden: true });

    expect(await readShown()).toEqual([]);

    await setBlockHidden({ id: block.id, isHidden: false });

    expect(await readShown()).toEqual([
      {
        title: 'Vigília',
        cancelled: true,
        blocks: [{ label: 'Culto', cancelled: true }],
      },
    ]);
  });

  it('leaves a hidden block out of an Event that stays on view', async () => {
    const { event: partly, block } = await seedEvent({
      title: 'Parcial',
      start: '2099-03-01T13:00',
    });
    await addBlock({
      eventId: partly.id,
      label: 'Noite',
      start: '2099-03-01T20:00',
    });
    await cancelBlock({ id: block.id });
    await setBlockHidden({ id: block.id, isHidden: true });

    const response = await readEvents({ slug: 'ib-esperanca' });

    expect(response.json().items).toEqual([
      {
        title: 'Parcial',
        cancelled: false,
        start: '2099-03-01T20:00:00.000Z',
        blocks: [
          {
            label: 'Noite',
            start: '2099-03-01T20:00:00.000Z',
            end: '2099-03-01T23:00:00.000Z',
            place: 'Templo',
            cancelled: false,
            movePath: [],
          },
        ],
      },
    ]);
  });

  it('keeps a hidden Event off the profile after its start when shown again', async () => {
    const { event: past } = await seedEvent({
      title: 'Passado',
      start: '2020-03-01T13:00',
    });
    await cancelEvent({ id: past.id });
    await setEventHidden({ id: past.id, isHidden: true });
    await setEventHidden({ id: past.id, isHidden: false });

    expect(await readShown()).toEqual([]);
  });

  it('rejects a malformed cursor', async () => {
    const response = await readEvents({ slug: 'ib-esperanca', cursor: 'x' });

    expect(response.statusCode).toBe(422);
  });

  it('answers 429 once a client IP is over the limit', async () => {
    for (let attempt = 0; attempt < MAX_REQUESTS; attempt += 1) {
      expect((await readEvents({ slug: 'ib-esperanca' })).statusCode).toBe(200);
    }

    expect((await readEvents({ slug: 'ib-esperanca' })).statusCode).toBe(429);
  });
});

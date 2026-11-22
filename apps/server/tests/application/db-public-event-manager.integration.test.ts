import { parseInstant } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbPublicEventManager } from '@/application/db-public-event-manager';
import { ChurchId } from '@/domain/branded-ids';
import { DrizzlePublicEventRepository } from '@/infrastructure/repositories/drizzle-public-event.repository';
import {
  buildEvent,
  buildEventTimeBlock,
  buildEventTimeBlockMove,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const manager = new DbPublicEventManager({
  publicEventRepository: new DrizzlePublicEventRepository({
    db: schedulingTestDb,
  }),
});

const at = (value: string) => parseInstant({ value: `${value}:00Z` });
const plusHour = (value: string) =>
  new Date(Date.parse(`${value}:00Z`) + 3_600_000).toISOString().slice(0, 16);
const NOW = at('2026-12-01T00:00');

describe('DbPublicEventManager', () => {
  let churchId: string;
  let otherChurchId: string;
  let sentCycleId: string;
  let draftCycleId: string;

  beforeEach(async () => {
    await resetSchedulingPhase3Db();
    const seed = await seedSchedulingPhase3Base();
    churchId = seed.churchAId;
    otherChurchId = seed.churchBId;
    const window = {
      startDate: new Date('2026-12-01'),
      endDate: new Date('2026-12-31'),
    };
    sentCycleId = (
      await createSchedulingPhase3Cycle({
        churchId,
        name: 'Sent',
        state: 'sent',
        ...window,
      })
    ).id;
    draftCycleId = (
      await createSchedulingPhase3Cycle({
        churchId,
        name: 'Draft',
        state: 'draft',
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-01-31'),
      })
    ).id;
  });

  async function publicEvent(input: {
    title: string;
    start: string;
    end?: string;
    cycleId?: string;
    churchId?: string;
    status?: 'scheduled' | 'cancelled';
    blocks?: Array<{
      label: string;
      start?: string;
      end?: string;
      isPublic?: boolean;
      place?: string;
      status?: 'active' | 'cancelled';
    }>;
  }) {
    const owner = input.churchId ?? churchId;
    const created = await buildEvent({
      db: schedulingTestDb,
      churchId: owner,
      cycleId: input.cycleId ?? sentCycleId,
      title: input.title,
      start: at(input.start),
      end: at(input.end ?? plusHour(input.start)),
      status: input.status ?? 'scheduled',
    });
    const blocks = [];
    for (const block of input.blocks ?? [
      { label: input.title, isPublic: true },
    ]) {
      blocks.push(
        await buildEventTimeBlock({
          db: schedulingTestDb,
          churchId: owner,
          eventId: created.id,
          start: at(block.start ?? input.start),
          end: at(block.end ?? plusHour(block.start ?? input.start)),
          label: block.label,
          isPublic: block.isPublic,
          place: block.place,
          status: block.status,
        }),
      );
    }
    return { event: created, blocks };
  }

  const list = (
    input: {
      limit?: number;
      after?: Parameters<typeof manager.listPublicEvents>[0]['after'];
    } = {},
  ) =>
    manager.listPublicEvents({
      churchId: ChurchId.from(churchId),
      now: NOW,
      limit: input.limit ?? 20,
      after: input.after,
    });

  it('shows only public blocks of sent-Cycle Events, excluding draft Cycles and private-only Events', async () => {
    const shown = await publicEvent({
      title: 'Sunday',
      start: '2026-12-06T12:00',
      end: '2026-12-06T15:00',
      blocks: [
        {
          label: 'Worship',
          start: '2026-12-06T12:00',
          end: '2026-12-06T14:00',
          isPublic: true,
          place: 'Hall',
        },
        {
          label: 'Kitchen',
          start: '2026-12-06T10:00',
          end: '2026-12-06T12:00',
          isPublic: false,
        },
      ],
    });
    await publicEvent({
      title: 'Draft',
      start: '2026-12-07T12:00',
      cycleId: draftCycleId,
    });
    await publicEvent({
      title: 'Private',
      start: '2026-12-08T12:00',
      blocks: [{ label: 'x', isPublic: false }],
    });
    await publicEvent({
      title: 'Other church',
      start: '2026-12-09T12:00',
      churchId: otherChurchId,
      cycleId: (
        await createSchedulingPhase3Cycle({
          churchId: otherChurchId,
          name: 'S',
          state: 'sent',
          startDate: new Date('2026-12-01'),
          endDate: new Date('2026-12-31'),
        })
      ).id,
    });

    const page = await list();

    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        eventId: shown.event.id,
        title: 'Sunday',
        cancelled: false,
        start: at('2026-12-06T12:00'),
        blocks: [
          {
            label: 'Worship',
            start: at('2026-12-06T12:00'),
            end: at('2026-12-06T14:00'),
            place: 'Hall',
            cancelled: false,
            movePath: {
              moved: false,
              steps: [
                { start: at('2026-12-06T12:00'), end: at('2026-12-06T14:00') },
              ],
            },
          },
        ],
      },
    ]);
  });

  it('marks cancelled: cancelled Event, single cancelled block, all public blocks cancelled with private ones on; not when Publico is unticked', async () => {
    await publicEvent({
      title: 'E1',
      start: '2026-12-02T10:00',
      status: 'cancelled',
    });
    await publicEvent({
      title: 'E2',
      start: '2026-12-03T10:00',
      blocks: [
        { label: 'a', isPublic: true, status: 'cancelled' },
        { label: 'b', isPublic: true },
      ],
    });
    await publicEvent({
      title: 'E3',
      start: '2026-12-04T10:00',
      blocks: [
        { label: 'a', isPublic: true, status: 'cancelled' },
        { label: 'private', isPublic: false },
      ],
    });
    await publicEvent({
      title: 'E4',
      start: '2026-12-05T10:00',
      blocks: [
        { label: 'a', isPublic: true },
        {
          label: 'unticked-after-cancel',
          isPublic: false,
          status: 'cancelled',
        },
      ],
    });

    const { items } = await list();

    expect(
      items.map((i) => [
        i.title,
        i.cancelled,
        i.blocks.map((b) => b.cancelled),
      ]),
    ).toEqual([
      ['E1', true, [true]],
      ['E2', false, [true, false]],
      ['E3', true, [true]],
      ['E4', false, [false]],
    ]);
  });

  it('drops past items; a cancelled item stays until its last start passes', async () => {
    await publicEvent({
      title: 'Past',
      start: '2026-11-20T10:00',
      end: '2026-11-20T11:00',
    });
    await publicEvent({
      title: 'Running',
      start: '2026-11-30T23:00',
      end: '2026-12-01T01:00',
      blocks: [{ label: 'r', isPublic: true, end: '2026-12-01T01:00' }],
    });
    await publicEvent({
      title: 'Cancelled upcoming',
      start: '2026-12-01T00:30',
      end: '2026-12-01T01:30',
      status: 'cancelled',
    });
    await publicEvent({
      title: 'Cancelled started',
      start: '2026-11-30T22:00',
      end: '2026-12-01T02:00',
      status: 'cancelled',
    });

    const { items } = await list();

    expect(items.map((i) => i.title)).toEqual([
      'Running',
      'Cancelled upcoming',
    ]);
  });

  it('orders by start then id and pages with a cursor', async () => {
    const same = '2026-12-10T10:00';
    for (const [title, start] of [
      ['c', '2026-12-12T10:00'],
      ['a', same],
      ['b', same],
      ['d', '2026-12-11T10:00'],
    ]) {
      await publicEvent({ title: title as string, start: start as string });
    }

    const first = await list({ limit: 2 });
    expect(first.items.map((i) => i.start)).toEqual([at(same), at(same)]);
    expect([...first.items.map((i) => i.eventId)]).toEqual(
      [...first.items.map((i) => i.eventId)].sort(),
    );
    expect(first.nextCursor).not.toBeNull();

    const second = await list({
      limit: 2,
      after: first.nextCursor ?? undefined,
    });
    expect(second.items.map((i) => i.title)).toEqual(['d', 'c']);
    expect(second.nextCursor).toBeNull();
  });

  it('exposes the move path per public block, with no mark once moved back', async () => {
    const { blocks } = await publicEvent({
      title: 'Moved',
      start: '2026-12-20T12:00',
      end: '2026-12-20T13:00',
    });
    const back = await publicEvent({
      title: 'Back',
      start: '2026-12-21T12:00',
      end: '2026-12-21T13:00',
    });
    const [movedBlock] = blocks;
    const [backBlock] = back.blocks;
    const move = (
      id: string,
      a: string,
      b: string,
      c: string,
      d: string,
      movedAt: string,
    ) =>
      buildEventTimeBlockMove({
        db: schedulingTestDb,
        churchId,
        eventTimeBlockId: id,
        previousStart: at(a),
        previousEnd: at(b),
        newStart: at(c),
        newEnd: at(d),
        movedAt: at(movedAt),
      });
    // Moved: as-sent 12:00 -> 14:00 -> current 12:00 (we then fix current below)
    await move(
      movedBlock?.id,
      '2026-12-19T12:00',
      '2026-12-19T13:00',
      '2026-12-19T15:00',
      '2026-12-19T16:00',
      '2026-12-02T10:00',
    );
    await move(
      movedBlock?.id,
      '2026-12-19T15:00',
      '2026-12-19T16:00',
      '2026-12-20T12:00',
      '2026-12-20T13:00',
      '2026-12-03T10:00',
    );
    await move(
      backBlock?.id,
      '2026-12-21T12:00',
      '2026-12-21T13:00',
      '2026-12-22T12:00',
      '2026-12-22T13:00',
      '2026-12-02T10:00',
    );
    await move(
      backBlock?.id,
      '2026-12-22T12:00',
      '2026-12-22T13:00',
      '2026-12-21T12:00',
      '2026-12-21T13:00',
      '2026-12-03T10:00',
    );

    const { items } = await list();

    expect(items.find((i) => i.title === 'Moved')?.blocks[0]?.movePath).toEqual(
      {
        moved: true,
        steps: [
          { start: at('2026-12-19T12:00'), end: at('2026-12-19T13:00') },
          { start: at('2026-12-19T15:00'), end: at('2026-12-19T16:00') },
          { start: at('2026-12-20T12:00'), end: at('2026-12-20T13:00') },
        ],
      },
    );
    expect(
      items.find((i) => i.title === 'Back')?.blocks[0]?.movePath.moved,
    ).toBe(false);
  });
});

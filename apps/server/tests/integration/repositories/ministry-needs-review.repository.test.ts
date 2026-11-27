import { ministry, usualSetup } from '@church/db';
import { parseTimeOfDay } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChurchId, MinistryId } from '@/domain/branded-ids';
import { usualSetupNeedsReview } from '@/domain/services/scheduling/usual-setup-planner';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { buildChurch } from '@/seeds/builders/church';
import { buildEventTemplate } from '@/seeds/builders/planning';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
} from '@/tests/scheduling-reshape/setup';

const db = schedulingTestDb;
const CHURCH = '41111111-1111-4111-8111-111111111111' as ChurchId;
const OTHER_CHURCH = '42222222-2222-4222-8222-222222222222' as ChurchId;

const time = (value: string) => parseTimeOfDay({ value });

/** Bounds around which the rule changes: ordinary, overnight and almost all day. */
const BLOCKS = [
  { label: 'day', startTime: time('09:00'), endTime: time('11:00') },
  { label: 'night', startTime: time('22:00'), endTime: time('02:00') },
  { label: 'long', startTime: time('00:01'), endTime: time('00:00') },
];
const TIMES = [
  '00:00',
  '00:01',
  '02:00',
  '02:01',
  '08:59',
  '09:00',
  '10:00',
  '11:00',
  '11:01',
  '22:00',
  '23:59',
].map(time);

const SINGLE_SPANS = TIMES.flatMap((startTime) =>
  TIMES.map((endTime) => [{ startTime, endTime }]),
);
const PAIR_STRIDE = 7;
/** A spread of ordered, touching, overlapping and reversed pairs. */
const SPAN_PAIRS = SINGLE_SPANS.flatMap((first, index) =>
  SINGLE_SPANS.filter(
    (_, other) => (index + other) % (PAIR_STRIDE * PAIR_STRIDE) === 0,
  ).map((second) => [...first, ...second]),
);
const SPLITS = [...SINGLE_SPANS, ...SPAN_PAIRS];

const repository = new DrizzleMinistryRepository({ db });

beforeEach(async () => {
  await resetSchedulingPhase3Db();
  for (const [id, slug] of [
    [CHURCH, 'review-a'],
    [OTHER_CHURCH, 'review-b'],
  ] as const) {
    await buildChurch({ db, id, name: slug, slug, timezone: 'UTC' });
  }
});

async function seedCases() {
  const template = await buildEventTemplate({
    db,
    churchId: CHURCH,
    name: 'Weekend',
    recurrence: { kind: 'weekly', weekdays: [0] },
    blocks: BLOCKS,
  });
  const cases = template.blocks.flatMap((row) => {
    const bounds = BLOCKS.find(({ label }) => label === row.label);
    if (!bounds) throw new Error(`unknown block ${row.label}`);
    return SPLITS.map((spans) => ({
      blockId: row.id,
      bounds,
      shiftSplit: { kind: 'manual' as const, spans },
    }));
  });
  const ministries = await db
    .insert(ministry)
    .values(cases.map((_, index) => ({ churchId: CHURCH, name: `m${index}` })))
    .returning({ id: ministry.id, name: ministry.name });
  const idByName = new Map(ministries.map((row) => [row.name, row.id]));
  const seeded = cases.map((entry, index) => ({
    ...entry,
    ministryId: idByName.get(`m${index}`) as MinistryId,
  }));
  await db.insert(usualSetup).values(
    seeded.map(({ ministryId, blockId, shiftSplit }) => ({
      churchId: CHURCH,
      ministryId,
      sourceTemplateTimeBlockId: blockId,
      serves: true,
      shiftSplit,
      headcounts: [],
    })),
  );
  return seeded;
}

/** The domain rule's own answer, the one the SQL must reproduce. */
function flaggedByDomain(seeded: Awaited<ReturnType<typeof seedCases>>) {
  return seeded.filter(({ bounds, shiftSplit }) =>
    usualSetupNeedsReview({
      entry: { serves: true, shiftSplit } as never,
      block: bounds as never,
    }),
  );
}

describe('DrizzleMinistryRepository.listNeedingReviewIds', () => {
  it('answers every split as the domain rule does', async () => {
    const seeded = await seedCases();
    const expected = flaggedByDomain(seeded);
    // Both answers must be well represented for the comparison to mean much.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(seeded.length);

    const ids = await repository.listNeedingReviewIds({
      churchId: CHURCH,
      ministryIds: seeded.map(({ ministryId }) => ministryId),
    });

    const flagged = new Set(ids);
    const disagreements = seeded
      .filter(
        (entry) => flagged.has(entry.ministryId) !== expected.includes(entry),
      )
      .map(({ bounds, shiftSplit }) => ({
        block: bounds.label,
        spans: shiftSplit.spans,
      }));
    expect(disagreements).toEqual([]);
  });

  it('answers only for the given Ministries of the given Church', async () => {
    const seeded = await seedCases();
    const flagged = flaggedByDomain(seeded);
    const [first, second] = flagged.map(({ ministryId }) => ministryId);
    if (!first || !second) throw new Error('two flagged Ministries needed');

    expect(
      await repository.listNeedingReviewIds({
        churchId: CHURCH,
        ministryIds: [first],
      }),
    ).toEqual([first]);
    expect(
      await repository.listNeedingReviewIds({
        churchId: OTHER_CHURCH,
        ministryIds: [first, second],
      }),
    ).toEqual([]);
    expect(
      await repository.listNeedingReviewIds({
        churchId: CHURCH,
        ministryIds: [],
      }),
    ).toEqual([]);
  });
});

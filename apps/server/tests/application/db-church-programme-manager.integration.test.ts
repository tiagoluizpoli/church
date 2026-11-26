import { churchAddress } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbChurchProgrammeManager } from '@/application/db-church-programme-manager';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { ChurchId } from '@/domain/branded-ids';
import { DrizzleChurchProgrammeRepository } from '@/infrastructure/repositories/drizzle-church-programme.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleTemplatePrecedenceRepository } from '@/infrastructure/repositories/drizzle-template-precedence.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';
import { insertChurchAddress } from '@/tests/test-support/church-address';

const templates = new DbEventTemplateManager({
  templateRepository: new DrizzleEventTemplateRepository({
    db: schedulingTestDb,
  }),
  precedenceRepository: new DrizzleTemplatePrecedenceRepository({
    db: schedulingTestDb,
  }),
  unitOfWork: new DrizzleUnitOfWork({ db: schedulingTestDb }),
});
const programme = new DbChurchProgrammeManager({
  programmeRepository: new DrizzleChurchProgrammeRepository({
    db: schedulingTestDb,
  }),
});

function block(
  label: string,
  startTime: string,
  isPublic: boolean,
  place?: string,
  endTime = '23:00',
) {
  return { label, startTime, endTime, isPublic, place };
}

describe('DbChurchProgrammeManager', () => {
  let churchA: ChurchId;
  let churchB: ChurchId;

  beforeEach(async () => {
    await resetSchedulingPhase3Db();
    const seed = await seedSchedulingPhase3Base();
    churchA = ChurchId.from(seed.churchAId);
    churchB = ChurchId.from(seed.churchBId);
  });

  it('returns only public blocks with recurrence, start time, label and place', async () => {
    await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        block('Worship', '09:00', true, 'Main hall'),
        block('Rehearsal', '07:00', false),
        block('Kids', '09:30', true),
      ],
    });

    const result = await programme.getProgramme({ churchId: churchA });

    expect(result).toEqual([
      {
        recurrence: { kind: 'weekly', weekdays: [0] },
        exceptOrdinals: [],
        startTime: '09:00',
        label: 'Worship',
        place: 'Main hall',
        atMainAddress: false,
      },
      {
        recurrence: { kind: 'weekly', weekdays: [0] },
        exceptOrdinals: [],
        startTime: '09:30',
        label: 'Kids',
        place: null,
        atMainAddress: false,
      },
    ]);
  });

  it('orders by Sunday-first weekday then start time, interleaving templates, with a stable tiebreak', async () => {
    await templates.createTemplate({
      churchId: churchA,
      name: 'Wednesday',
      recurrence: { kind: 'weekly', weekdays: [3] },
      blocks: [block('Study', '19:30', true)],
    });
    const morning = await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday morning',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Worship', '09:00', true), block('Tie B', '18:00', true)],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday evening',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Tie A', '18:00', true), block('Prayer', '08:00', true)],
      // Both Sunday templates run: the overlapping pair is kept, not decided.
      precedences: [{ otherTemplateId: morning.id, answer: 'both' }],
    });

    const result = await programme.getProgramme({ churchId: churchA });

    expect(result.map((item) => item.label)).toEqual([
      'Prayer',
      'Worship',
      'Tie A',
      'Tie B',
      'Study',
    ]);
  });

  it('reflects a template edit at once', async () => {
    const template = await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Worship', '09:00', true)],
    });
    const [existing] = template.blocks;

    await templates.updateTemplate({
      churchId: churchA,
      templateId: template.id,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [6] },
      blocks: [
        {
          id: existing?.id as string,
          ...block('Vigil', '20:00', true, 'Chapel'),
        },
      ],
    });

    expect(await programme.getProgramme({ churchId: churchA })).toEqual([
      {
        recurrence: { kind: 'weekly', weekdays: [6] },
        exceptOrdinals: [],
        startTime: '20:00',
        label: 'Vigil',
        place: 'Chapel',
        atMainAddress: false,
      },
    ]);
  });

  it('names a Church Address place by its label, or by its street once edited', async () => {
    const templo = await insertChurchAddress({
      db: schedulingTestDb,
      churchId: churchA,
      label: 'Templo',
    });
    const anexo = await insertChurchAddress({
      db: schedulingTestDb,
      churchId: churchA,
      label: null,
      isMain: false,
      position: 1,
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        { ...block('Worship', '09:00', true), placeAddressId: templo },
        { ...block('Kids', '09:30', true), placeAddressId: anexo },
      ],
    });
    await schedulingTestDb
      .update(churchAddress)
      .set({ street: 'Rua Nova', complement: 'Fundos' })
      .where(eq(churchAddress.id, anexo));

    const result = await programme.getProgramme({ churchId: churchA });

    expect(result.map(({ place }) => place)).toEqual([
      'Templo',
      'Rua Nova, 10 – Fundos · Centro · Campinas/SP',
    ]);
  });

  it("never shows another Church's templates", async () => {
    await templates.createTemplate({
      churchId: churchB,
      name: 'Other',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Foreign', '09:00', true)],
    });

    expect(await programme.getProgramme({ churchId: churchA })).toEqual([]);
  });

  it('orders weekday activities first, weekly before monthly, then day-of-month ones, and words the lost nth weekday', async () => {
    const sunday = await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Weekly service', '09:00', true)],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Santa Ceia',
      recurrence: {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
      },
      blocks: [block('Supper', '09:00', true)],
      precedences: [{ otherTemplateId: sunday.id, answer: 'thisWins' }],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Prayer',
      recurrence: {
        kind: 'monthly',
        entries: [{ kind: 'dayOfMonth', day: 15 }],
      },
      blocks: [block('Prayer 15', '07:00', true, undefined, '08:00')],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Youth',
      recurrence: {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 'last', weekday: 6 }],
      },
      blocks: [block('Youth', '19:00', true)],
    });

    const result = await programme.getProgramme({ churchId: churchA });

    expect(
      result.map(({ label, exceptOrdinals }) => [label, exceptOrdinals]),
    ).toEqual([
      ['Weekly service', [1]],
      ['Supper', []],
      ['Youth', []],
      ['Prayer 15', []],
    ]);
  });

  it('words no except for a winner on a day of the month', async () => {
    const sunday = await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [block('Weekly service', '09:00', true)],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Fifteenth',
      recurrence: {
        kind: 'monthly',
        entries: [{ kind: 'dayOfMonth', day: 15 }],
      },
      blocks: [block('Day 15', '09:00', true, undefined, '10:00')],
      precedences: [{ otherTemplateId: sunday.id, answer: 'thisWins' }],
    });

    const result = await programme.getProgramme({ churchId: churchA });

    expect(result.map(({ exceptOrdinals }) => exceptOrdinals)).toEqual([
      [],
      [],
    ]);
  });

  it('words the except only on the block a winner overlaps', async () => {
    const sunday = await templates.createTemplate({
      churchId: churchA,
      name: 'Sunday',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        block('Morning', '09:00', true, undefined, '10:00'),
        block('Evening', '19:00', true, undefined, '21:00'),
      ],
    });
    await templates.createTemplate({
      churchId: churchA,
      name: 'Santa Ceia',
      recurrence: {
        kind: 'monthly',
        entries: [{ kind: 'nthWeekday', ordinal: 1, weekday: 0 }],
      },
      blocks: [block('Supper', '19:30', true, undefined, '20:30')],
      precedences: [{ otherTemplateId: sunday.id, answer: 'thisWins' }],
    });

    const result = await programme.getProgramme({ churchId: churchA });

    expect(
      result.map(({ label, exceptOrdinals }) => [label, exceptOrdinals]),
    ).toEqual([
      ['Morning', []],
      ['Evening', [1]],
      ['Supper', []],
    ]);
  });

  it('places weekly by its first weekday, a mixed Recurrence by its first entry, and day-of-month ones by day then time, last day last', async () => {
    const create = (name: string, recurrence: never, startTime: string) =>
      templates.createTemplate({
        churchId: churchA,
        name,
        recurrence,
        blocks: [
          block(name, startTime, true, undefined, `${startTime.slice(0, 3)}30`),
        ],
      });
    await create(
      'day 15 late',
      monthly({ kind: 'dayOfMonth', day: 15 }),
      '20:00',
    );
    await create('last day', monthly({ kind: 'lastDayOfMonth' }), '08:00');
    await create(
      'day 15 early',
      monthly({ kind: 'dayOfMonth', day: 15 }),
      '07:00',
    );
    await create('day 2', monthly({ kind: 'dayOfMonth', day: 2 }), '22:00');
    await create('sat', { kind: 'weekly', weekdays: [6] } as never, '23:00');
    await create(
      'mixed day first',
      monthly(
        { kind: 'dayOfMonth', day: 1 },
        { kind: 'nthWeekday', ordinal: 1, weekday: 0 },
      ),
      '10:00',
    );
    await create(
      'mixed weekday first',
      monthly(
        { kind: 'nthWeekday', ordinal: 'last', weekday: 5 },
        { kind: 'dayOfMonth', day: 1 },
      ),
      '09:00',
    );
    await create(
      'wed and mon',
      { kind: 'weekly', weekdays: [3, 1] } as never,
      '06:00',
    );

    const result = await programme.getProgramme({ churchId: churchA });

    expect(result.map(({ label }) => label)).toEqual([
      'wed and mon',
      'mixed weekday first',
      'sat',
      'mixed day first',
      'day 2',
      'day 15 early',
      'day 15 late',
      'last day',
    ]);
  });
});

function monthly(...entries: unknown[]): never {
  return { kind: 'monthly', entries } as never;
}

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
) {
  return { label, startTime, endTime: '23:00', isPublic, place };
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
        startTime: '09:00',
        label: 'Worship',
        place: 'Main hall',
      },
      {
        recurrence: { kind: 'weekly', weekdays: [0] },
        startTime: '09:30',
        label: 'Kids',
        place: null,
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
        startTime: '20:00',
        label: 'Vigil',
        place: 'Chapel',
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
});

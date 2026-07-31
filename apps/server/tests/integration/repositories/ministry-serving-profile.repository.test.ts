import { eventTemplate, timeBlock } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, MinistryId } from '../../../src/domain/branded-ids';
import { DrizzleMinistryServingProfileRepository } from '../../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

async function seedTemplateBlock(input: {
  churchId: string;
  label: string;
  order?: number;
}) {
  const [template] = await schedulingTestDb
    .insert(eventTemplate)
    .values({
      churchId: input.churchId,
      name: `Template for ${input.label}`,
      weekday: 0,
    })
    .returning();
  if (!template) throw new Error('template seed failed');

  const [block] = await schedulingTestDb
    .insert(timeBlock)
    .values({
      churchId: input.churchId,
      templateId: template.id,
      label: input.label,
      startTime: '09:00:00',
      endTime: '10:00:00',
      order: input.order ?? 1,
    })
    .returning();
  if (!block) throw new Error('block seed failed');
  return block;
}

describe('DrizzleMinistryServingProfileRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('listByMinistry returns [] when no profiles exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleMinistryServingProfileRepository({
      db: schedulingTestDb,
    });

    const result = await repo.listByMinistry({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
    });

    expect(result).toEqual([]);
  });

  it('replaceForMinistry creates entries with equal split, mapped headcounts (with and without teamId)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const block = await seedTemplateBlock({
      churchId: seed.churchAId,
      label: 'Welcome',
    });
    const repo = new DrizzleMinistryServingProfileRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const ministryId = MinistryId.from(seed.ministryAId);

    const created = await repo.replaceForMinistry({
      churchId,
      ministryId,
      entries: [
        {
          sourceTemplateBlockId: block.id as never,
          serves: true,
          shiftSplit: { kind: 'equal', count: 2 },
          headcounts: [
            {
              roleId: '55555555-5555-5555-5555-555555555551' as never,
              count: 1,
            },
            {
              roleId: '55555555-5555-5555-5555-555555555552' as never,
              teamId: '66666666-6666-6666-6666-666666666661' as never,
              count: 3,
            },
          ],
        },
      ],
    });

    expect(created).toHaveLength(1);
    expect(created[0]?.serves).toBe(true);
    expect(created[0]?.shiftSplit).toEqual({ kind: 'equal', count: 2 });
    expect(created[0]?.headcounts).toEqual([
      { roleId: '55555555-5555-5555-5555-555555555551', count: 1 },
      {
        roleId: '55555555-5555-5555-5555-555555555552',
        teamId: '66666666-6666-6666-6666-666666666661',
        count: 3,
      },
    ]);

    const listed = await repo.listByMinistry({ churchId, ministryId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created[0]?.id);
  });

  it('replaceForMinistry with manual split replaces prior entries and returns [] for empty entries', async () => {
    const seed = await seedSchedulingPhase3Base();
    const block = await seedTemplateBlock({
      churchId: seed.churchAId,
      label: 'Message',
    });
    const repo = new DrizzleMinistryServingProfileRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const ministryId = MinistryId.from(seed.ministryAId);

    await repo.replaceForMinistry({
      churchId,
      ministryId,
      entries: [
        {
          sourceTemplateBlockId: block.id as never,
          serves: false,
          shiftSplit: {
            kind: 'manual',
            spans: [
              { label: 'First half', startTime: '09:00', endTime: '09:30' },
            ],
          },
          headcounts: [],
        },
      ],
    });

    const afterFirst = await repo.listByMinistry({ churchId, ministryId });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.shiftSplit).toEqual({
      kind: 'manual',
      spans: [{ label: 'First half', startTime: '09:00', endTime: '09:30' }],
    });

    const replaced = await repo.replaceForMinistry({
      churchId,
      ministryId,
      entries: [],
    });

    expect(replaced).toEqual([]);
    const afterReplace = await repo.listByMinistry({ churchId, ministryId });
    expect(afterReplace).toEqual([]);
  });

  it('listByChurch aggregates profiles across ministries within the same church and respects church isolation', async () => {
    const seed = await seedSchedulingPhase3Base();
    const blockA = await seedTemplateBlock({
      churchId: seed.churchAId,
      label: 'Block A',
    });
    const blockB = await seedTemplateBlock({
      churchId: seed.churchBId,
      label: 'Block B',
    });
    const repo = new DrizzleMinistryServingProfileRepository({
      db: schedulingTestDb,
    });

    await repo.replaceForMinistry({
      churchId: ChurchId.from(seed.churchAId),
      ministryId: MinistryId.from(seed.ministryAId),
      entries: [
        {
          sourceTemplateBlockId: blockA.id as never,
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [],
        },
      ],
    });
    await repo.replaceForMinistry({
      churchId: ChurchId.from(seed.churchBId),
      ministryId: MinistryId.from(seed.ministryBId),
      entries: [
        {
          sourceTemplateBlockId: blockB.id as never,
          serves: true,
          shiftSplit: { kind: 'equal', count: 1 },
          headcounts: [],
        },
      ],
    });

    const churchAProfiles = await repo.listByChurch({
      churchId: ChurchId.from(seed.churchAId),
    });
    const churchBProfiles = await repo.listByChurch({
      churchId: ChurchId.from(seed.churchBId),
    });

    expect(churchAProfiles).toHaveLength(1);
    expect(churchBProfiles).toHaveLength(1);
    expect(churchAProfiles[0]?.ministryId).toBe(seed.ministryAId);
    expect(churchBProfiles[0]?.ministryId).toBe(seed.ministryBId);
  });
});

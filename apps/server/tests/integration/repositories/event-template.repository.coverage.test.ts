import { NotFoundError } from '@church/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, EventTemplateId } from '@/domain/branded-ids';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import {
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleEventTemplateRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('update throws NotFoundError when the template does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });

    await expect(
      repo.update({
        churchId: ChurchId.from(seed.churchAId),
        templateId: EventTemplateId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
        name: 'Nope',
        weekday: 0,
        blocks: [],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getById throws NotFoundError for an invalid uuid and for a missing template', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.getById({
        churchId,
        templateId: EventTemplateId.from('not-a-uuid'),
      }),
    ).rejects.toThrow(NotFoundError);

    await expect(
      repo.getById({
        churchId,
        templateId: EventTemplateId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('getByIds returns [] without querying when templateIds is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });

    const result = await repo.getByIds({
      churchId: ChurchId.from(seed.churchAId),
      templateIds: [],
    });
    expect(result).toEqual([]);
  });

  it("list and getByIds group each template's blocks in order from one batched read", async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const alpha = await repo.create({
      churchId,
      name: 'Alpha',
      weekday: 0,
      blocks: [
        { label: 'Second', startTime: '11:00', endTime: '12:00', order: 2 },
        { label: 'First', startTime: '09:00', endTime: '10:00', order: 1 },
      ],
    });
    const beta = await repo.create({
      churchId,
      name: 'Beta',
      weekday: 1,
      blocks: [
        { label: 'Only', startTime: '18:00', endTime: '19:00', order: 1 },
      ],
    });
    const empty = await repo.create({
      churchId,
      name: 'Gamma',
      weekday: 2,
      blocks: [],
    });

    const listed = await repo.list({ churchId });
    expect(listed.map((t) => t.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(listed[0]?.blocks.map((b) => b.label)).toEqual(['First', 'Second']);
    expect(listed[1]?.blocks.map((b) => b.label)).toEqual(['Only']);
    expect(listed[2]?.blocks).toEqual([]);

    // Block createdAt is stamped by the mapper at read time, so compare the
    // persisted facts instead of the entities.
    const facts = (t: (typeof listed)[number]) => ({
      id: t.id,
      name: t.name,
      weekday: t.weekday,
      blocks: t.blocks.map((b) => [
        b.id,
        b.label,
        b.startTime,
        b.endTime,
        b.order,
      ]),
    });
    for (const template of [alpha, beta, empty]) {
      expect(facts(listed.find((t) => t.id === template.id) as never)).toEqual(
        facts(await repo.getById({ churchId, templateId: template.id })),
      );
    }

    const byIds = await repo.getByIds({
      churchId,
      templateIds: [alpha.id, beta.id],
    });
    expect(byIds.map((t) => t.blocks.map((b) => b.label)).sort()).toEqual([
      ['First', 'Second'],
      ['Only'],
    ]);
  });

  it('accepts a time block whose end is before its start (crosses midnight)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    const template = await repo.create({
      churchId,
      name: 'Overnight Watch',
      weekday: 3,
      blocks: [
        { label: 'Vigil', startTime: '22:00', endTime: '02:00', order: 1 },
      ],
    });

    expect(template.blocks).toHaveLength(1);
    expect(template.blocks[0]?.startTime).toBe('22:00');
    expect(template.blocks[0]?.endTime).toBe('02:00');
  });

  it('rejects a time block whose start and end are equal', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleEventTemplateRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await expect(
      repo.create({
        churchId,
        name: 'Broken',
        weekday: 3,
        blocks: [
          {
            label: 'Zero-length',
            startTime: '10:00',
            endTime: '10:00',
            order: 1,
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

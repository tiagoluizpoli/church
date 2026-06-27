import { roleTemplate, roleTemplateItem, slotRequirement } from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

const TEMPLATE_ID = 'ffffffff-ffff-ffff-ffff-fffffffffff1';

describe('applyRoleTemplate (T112)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
    await testDb.insert(roleTemplate).values({
      id: TEMPLATE_ID,
      churchId: SEED.church,
      ministryId: SEED.ministryAdult,
      name: 'Standard Sunday',
    });
    await testDb.insert(roleTemplateItem).values({
      id: 'ffffffff-ffff-ffff-ffff-fffffffffff2',
      churchId: SEED.church,
      templateId: TEMPLATE_ID,
      roleId: SEED.roleGreeter,
      requiredCount: 3,
    });
  });

  const caller = () => createCaller(SEED.userAlice);

  it('upserts template requirements onto every slot of the event', async () => {
    const result = await caller().adminLeader.applyRoleTemplate({
      eventId: SEED.eventDraft,
      templateId: TEMPLATE_ID,
    });
    // Draft event has one slot (slot-1) and the template has one item.
    expect(result.updatedSlotCount).toBe(1);
    expect(result.requirementsCreated).toBe(1);
  });

  it('persists the new requirement on the slot', async () => {
    await caller().adminLeader.applyRoleTemplate({
      eventId: SEED.eventDraft,
      templateId: TEMPLATE_ID,
    });
    const reqs = await testDb
      .select()
      .from(slotRequirement)
      .where(
        and(
          eq(slotRequirement.slotId, SEED.slotDraft),
          eq(slotRequirement.roleId, SEED.roleGreeter),
        ),
      );
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.requiredCount).toBe(3);
  });

  it('rejects an unknown template', async () => {
    await expect(
      caller().adminLeader.applyRoleTemplate({
        eventId: SEED.eventDraft,
        templateId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      }),
    ).rejects.toThrow(/not found/i);
  });
});

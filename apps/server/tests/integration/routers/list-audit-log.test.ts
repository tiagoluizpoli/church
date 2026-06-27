import { assignmentAudit } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

describe('listAuditLog (T105)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
  });

  const caller = () => createCaller(SEED.userAlice);

  it('returns only override entries (those carrying a reason)', async () => {
    // Seed audits (created / status_change) have no reason → excluded.
    await testDb.insert(assignmentAudit).values({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbf1',
      churchId: SEED.church,
      assignmentId: SEED.assignmentConfirmed,
      actorId: SEED.userAlice,
      action: 'updated',
      reason: 'Double-booked override approved',
      timestamp: new Date('2024-06-02T10:00:00Z'),
    });

    const entries = await caller().adminLeader.listAuditLog({
      eventId: SEED.eventDraft,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reason).toBe('Double-booked override approved');
    expect(entries[0]?.action).toBe('updated');
  });

  it('returns an empty array when there are no override entries', async () => {
    const entries = await caller().adminLeader.listAuditLog({
      eventId: SEED.eventDraft,
    });
    expect(entries).toEqual([]);
  });

  describe('Permission Failures', () => {
    it('rejects a non-leader', async () => {
      await expect(
        createCaller(SEED.userBob).adminLeader.listAuditLog({
          eventId: SEED.eventDraft,
        }),
      ).rejects.toThrow();
    });
  });
});

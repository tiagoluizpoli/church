import { NotFoundError } from '@church/core';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { AvailabilityCheckId, ChurchId } from '@/domain/branded-ids';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { buildShift } from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

describe('DrizzleAvailabilityCheckRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('getCheckContext throws NotFoundError when the check does not exist', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    });

    await expect(
      repo.getCheckContext({
        churchId: ChurchId.from(seed.churchAId),
        checkId: AvailabilityCheckId.from(
          '99999999-9999-4999-8999-999999999999',
        ),
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('listMinistryLeaderVolunteerIds returns [] without querying when ministryIds is empty', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    });

    const result = await repo.listMinistryLeaderVolunteerIds({
      churchId: ChurchId.from(seed.churchAId),
      ministryIds: [],
    });
    expect(result).toEqual([]);
  });

  it('listCheckShifts defaults a missing shift label to undefined', async () => {
    const { ministryMembership } = await import('@church/db');
    const seed = await seedSchedulingPhase3Base();
    const cycle = await createSchedulingPhase3Cycle({
      churchId: seed.churchAId,
      name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-09-01T00:00:00.000Z'),
    });
    const graph = await createSchedulingPhase3EventGraph({
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryId: seed.ministryAId,
      title: 'Sunday Service',
      start: new Date('2026-08-02T09:00:00.000Z'),
      end: new Date('2026-08-02T11:00:00.000Z'),
      status: 'scheduled',
    });

    const shiftRow = await buildShift({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
      label: null,
    });

    const [membership] = await schedulingTestDb
      .select()
      .from(ministryMembership)
      .where(eq(ministryMembership.volunteerId, seed.adminVolunteerId))
      .limit(1);
    if (!membership) throw new Error('ministry volunteer seed missing');

    const checkRow = await buildAvailabilityCheck({
      db: schedulingTestDb,
      churchId: seed.churchAId,
      cycleId: cycle.id,
      ministryMembershipId: membership.id,
    });

    const repo = new DrizzleAvailabilityCheckRepository({
      db: schedulingTestDb,
    });
    const rows = await repo.listCheckShifts({
      churchId: ChurchId.from(seed.churchAId),
      checkId: AvailabilityCheckId.from(checkRow.id),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBeUndefined();
    expect(rows[0]?.shiftId).toBe(shiftRow.id);
  });
});

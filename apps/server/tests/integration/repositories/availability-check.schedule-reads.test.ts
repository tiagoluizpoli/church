import { availabilityAsk, eventTimeBlock } from '@church/db';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId, CycleId, MinistryId } from '@/domain/branded-ids';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import { buildShift, buildShiftRequirement } from '@/seeds/builders/scheduling';
import {
  buildAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import { buildVolunteerWithMembership } from '@/seeds/builders/volunteer';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const LEADER_MEMBERSHIP_ID = '44444444-4444-4444-8444-4444444444a1';

interface MemberInput {
  ministryId: string;
  name: string;
  roleIds: string[];
  status?: 'active' | 'inactive';
}

interface ServedShiftInput {
  cycleId: string;
  ministryId: string;
  day: string;
  status?: 'scheduled' | 'cancelled';
  /** Cancels the Event's only EventTimeBlock, leaving the Event scheduled. */
  blockCancelled?: boolean;
  needs: NeededPlace[];
}

interface NeededPlace {
  roleId: string;
  sectorId: string;
}

/**
 * One Schedule (Ministry A × the Cycle) with a worked example:
 *
 *   Morning needs Sound twice (two Sectors) and Camera
 *   Evening needs Camera
 *   Cancelled-Event Shift needs Sound (not served)
 *   Cancelled-block Shift needs Lights and Sound (not served)
 *   Next Cycle's Shift needs Lights (not this Schedule)
 *   Another Ministry's Shift needs its own Role
 *
 *   Ana holds Sound                      eligible, 1 relevant Shift (Morning)
 *   Bia holds Sound and Camera           eligible, 2 relevant Shifts
 *   Caio holds Lights                    not eligible
 *   Leader holds nothing                 not eligible
 *   Davi holds Sound, membership ended   not eligible
 */
async function seedSchedule() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const otherMinistry = await buildMinistry({
    db,
    churchId,
    name: 'Other Ministry',
  });

  const child = { db, churchId, ministryId };
  const sound = await buildRole({ ...child, name: 'Sound' });
  const camera = await buildRole({ ...child, name: 'Camera' });
  const lights = await buildRole({ ...child, name: 'Lights' });
  const stage = await buildSector({ ...child, name: 'Stage' });
  const booth = await buildSector({ ...child, name: 'Booth' });
  const otherRole = await buildRole({
    db,
    churchId,
    ministryId: otherMinistry.id,
    name: 'Greeter',
  });
  const otherSector = await buildSector({
    db,
    churchId,
    ministryId: otherMinistry.id,
    name: 'Door',
  });

  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'August',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-31T00:00:00.000Z'),
  });
  const nextCycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'September',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-30T00:00:00.000Z'),
  });

  async function servedShift({
    cycleId,
    ministryId: servingMinistryId,
    day,
    status = 'scheduled',
    blockCancelled = false,
    needs,
  }: ServedShiftInput) {
    const graph = await createSchedulingPhase3EventGraph({
      churchId,
      cycleId,
      ministryId: servingMinistryId,
      title: `Event ${day}`,
      start: new Date(`${day}T09:00:00.000Z`),
      end: new Date(`${day}T11:00:00.000Z`),
      status,
    });
    if (blockCancelled) {
      await db
        .update(eventTimeBlock)
        .set({ status: 'cancelled' })
        .where(eq(eventTimeBlock.id, graph.eventTimeBlock.id));
    }
    const shift = await buildShift({
      db,
      churchId,
      participationId: graph.participation.id,
      eventTimeBlockId: graph.eventTimeBlock.id,
      start: fromDate({ date: graph.eventTimeBlock.startTime }),
      end: fromDate({ date: graph.eventTimeBlock.endTime }),
    });
    for (const { roleId, sectorId } of needs) {
      await buildShiftRequirement({
        db,
        churchId,
        participationId: graph.participation.id,
        shiftId: shift.id,
        roleId,
        sectorId,
        peopleNeeded: 1,
      });
    }
    return shift;
  }

  const inCycle = { cycleId: cycle.id, ministryId };
  const morning = await servedShift({
    ...inCycle,
    day: '2026-08-02',
    needs: [
      { roleId: sound.id, sectorId: stage.id },
      { roleId: sound.id, sectorId: booth.id },
      { roleId: camera.id, sectorId: stage.id },
    ],
  });
  const evening = await servedShift({
    ...inCycle,
    day: '2026-08-09',
    needs: [{ roleId: camera.id, sectorId: stage.id }],
  });
  const cancelled = await servedShift({
    ...inCycle,
    day: '2026-08-16',
    status: 'cancelled',
    needs: [{ roleId: sound.id, sectorId: stage.id }],
  });
  const cancelledBlock = await servedShift({
    ...inCycle,
    day: '2026-08-23',
    blockCancelled: true,
    needs: [
      { roleId: lights.id, sectorId: stage.id },
      { roleId: sound.id, sectorId: stage.id },
    ],
  });
  await servedShift({
    cycleId: nextCycle.id,
    ministryId,
    day: '2026-09-06',
    needs: [{ roleId: lights.id, sectorId: stage.id }],
  });
  await servedShift({
    cycleId: cycle.id,
    ministryId: otherMinistry.id,
    day: '2026-08-02',
    needs: [{ roleId: otherRole.id, sectorId: otherSector.id }],
  });

  async function member({
    ministryId: id,
    name,
    roleIds,
    status,
  }: MemberInput) {
    const { membership } = await buildVolunteerWithMembership({
      db,
      churchId,
      ministryId: id,
      name,
      email: `${name.toLowerCase()}@test.com`,
      roleIds,
      status,
    });
    return membership.id;
  }

  const ana = await member({ ministryId, name: 'Ana', roleIds: [sound.id] });
  const bia = await member({
    ministryId,
    name: 'Bia',
    roleIds: [sound.id, camera.id],
  });
  const caio = await member({ ministryId, name: 'Caio', roleIds: [lights.id] });
  const davi = await member({
    ministryId,
    name: 'Davi',
    roleIds: [sound.id],
    status: 'inactive',
  });
  await member({
    ministryId: otherMinistry.id,
    name: 'Greta',
    roleIds: [otherRole.id],
  });

  const scope = {
    churchId: ChurchId.from(churchId),
    ministryId: MinistryId.from(ministryId),
    cycleId: CycleId.from(cycle.id),
  };

  return {
    seed,
    scope,
    cycleId: cycle.id,
    morning,
    evening,
    cancelled,
    cancelledBlock,
    memberships: { ana, bia, caio, davi },
  };
}

const repo = () => new DrizzleAvailabilityCheckRepository({ db });

describe('Schedule reads of the availability repository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  describe('listEligibleMemberships', () => {
    it('returns exactly the active memberships holding a Role a served Shift needs', async () => {
      const { scope } = await seedSchedule();

      const rows = await repo().listEligibleMemberships(scope);

      expect(rows.map((row) => row.volunteerName).sort()).toEqual([
        'Ana',
        'Bia',
      ]);
    });

    it('runs inside a transaction, where it locks the memberships it returns', async () => {
      const { scope } = await seedSchedule();

      const rows = await new DrizzleUnitOfWork({ db }).run((tx) =>
        repo().listEligibleMemberships({ ...scope, tx }),
      );

      expect(rows.map((row) => row.volunteerName).sort()).toEqual([
        'Ana',
        'Bia',
      ]);
    });

    it("sees nothing through another Church's scope", async () => {
      const { scope, seed } = await seedSchedule();

      const rows = await repo().listEligibleMemberships({
        ...scope,
        churchId: ChurchId.from(seed.churchBId),
      });

      expect(rows).toEqual([]);
    });
  });

  describe('listRelevantShiftTotals', () => {
    it('counts each active membership its served Shifts needing a held Role, once per Shift', async () => {
      const { scope, memberships } = await seedSchedule();

      const rows = await repo().listRelevantShiftTotals(scope);

      expect(rows).toHaveLength(4);
      expect(rows).toEqual(
        expect.arrayContaining([
          { ministryMembershipId: memberships.ana, shiftCount: 1 },
          { ministryMembershipId: memberships.bia, shiftCount: 2 },
          { ministryMembershipId: memberships.caio, shiftCount: 0 },
          { ministryMembershipId: LEADER_MEMBERSHIP_ID, shiftCount: 0 },
        ]),
      );
    });

    it("sees nothing through another Church's scope", async () => {
      const { scope, seed } = await seedSchedule();

      const rows = await repo().listRelevantShiftTotals({
        ...scope,
        churchId: ChurchId.from(seed.churchBId),
      });

      expect(rows).toEqual([]);
    });
  });

  describe('listCheckMarkCounts', () => {
    it('counts only marks on served Shifts needing a Role the check holder holds', async () => {
      const {
        scope,
        seed,
        cycleId,
        morning,
        evening,
        cancelled,
        cancelledBlock,
        memberships,
      } = await seedSchedule();
      const churchId = seed.churchAId;
      const check = (ministryMembershipId: string) =>
        buildAvailabilityCheck({
          db,
          churchId,
          cycleId,
          ministryMembershipId,
        });
      const mark = (availabilityCheckId: string, shiftId: string) =>
        buildUnavailableShift({ db, churchId, availabilityCheckId, shiftId });

      const anaCheck = await check(memberships.ana);
      const biaCheck = await check(memberships.bia);
      const caioCheck = await check(memberships.caio);
      await buildAvailabilityCheck({
        db,
        churchId,
        cycleId,
        ministryMembershipId: memberships.davi,
        withdrawnAt: fromDate({ date: new Date('2026-08-01T00:00:00.000Z') }),
      });
      // Evening needs only Camera, which Ana does not hold.
      await mark(anaCheck.id, morning.id);
      await mark(anaCheck.id, evening.id);
      // The cancelled Event's Shift is not served.
      await mark(biaCheck.id, morning.id);
      await mark(biaCheck.id, evening.id);
      await mark(biaCheck.id, cancelled.id);
      await mark(biaCheck.id, cancelledBlock.id);
      // Morning needs no Role that Caio holds.
      await mark(caioCheck.id, morning.id);

      const rows = await repo().listCheckMarkCounts(scope);

      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          { availabilityCheckId: anaCheck.id, unavailableShiftCount: 1 },
          { availabilityCheckId: biaCheck.id, unavailableShiftCount: 2 },
          { availabilityCheckId: caioCheck.id, unavailableShiftCount: 0 },
        ]),
      );
    });

    it('reports zero for a check with no marks', async () => {
      const { scope, seed, cycleId, memberships } = await seedSchedule();
      const anaCheck = await buildAvailabilityCheck({
        db,
        churchId: seed.churchAId,
        cycleId,
        ministryMembershipId: memberships.ana,
      });

      expect(await repo().listCheckMarkCounts(scope)).toEqual([
        { availabilityCheckId: anaCheck.id, unavailableShiftCount: 0 },
      ]);
    });

    it("sees nothing through another Church's scope", async () => {
      const { scope, seed, cycleId, memberships } = await seedSchedule();
      await buildAvailabilityCheck({
        db,
        churchId: seed.churchAId,
        cycleId,
        ministryMembershipId: memberships.ana,
      });

      const rows = await repo().listCheckMarkCounts({
        ...scope,
        churchId: ChurchId.from(seed.churchBId),
      });

      expect(rows).toEqual([]);
    });
  });
});

describe('availability_ask table', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('holds one row per (Church, Ministry, Cycle), with the Deadline as a CalendarDay', async () => {
    const { seed, cycleId } = await seedSchedule();
    const key = {
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      cycleId,
    };
    const askedAt = new Date('2026-08-01T12:00:00.000Z');

    const [created] = await db
      .insert(availabilityAsk)
      .values({ ...key, askedAt, answerBy: '2026-08-20' })
      .returning();

    expect(created?.askedAt).toEqual(askedAt);
    expect(created?.answerBy).toBe('2026-08-20');
    expect(created?.lastRemindedAt).toBeNull();
    await expect(
      db.insert(availabilityAsk).values({ ...key, askedAt }),
    ).rejects.toThrow();
  });
});

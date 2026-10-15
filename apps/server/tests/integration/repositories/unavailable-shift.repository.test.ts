import { ministryMembership } from '@church/db';
import { fromDate } from '@church/time';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AvailabilityCheckId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '@/domain/branded-ids';
import { DrizzleUnavailableShiftRepository } from '@/infrastructure/repositories/drizzle-unavailable-shift.repository';
import { buildShift } from '@/seeds/builders/scheduling';
import { buildAvailabilityCheck } from '@/seeds/builders/unavailable-shift';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

async function seedCheckWithShift(
  churchId: string,
  ministryId: string,
  volunteerId: string,
) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId,
    cycleId: cycle.id,
    ministryId,
    title: 'Sunday Service',
    start: new Date('2026-08-02T09:00:00.000Z'),
    end: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });

  const shiftRow = await buildShift({
    db: schedulingTestDb,
    churchId: churchId,
    participationId: graph.participation.id,
    eventTimeBlockId: graph.eventTimeBlock.id,
    start: fromDate({ date: graph.eventTimeBlock.startTime }),
    end: fromDate({ date: graph.eventTimeBlock.endTime }),
    label: 'Whole event time block',
  });

  const [membership] = await schedulingTestDb
    .select()
    .from(ministryMembership)
    .where(
      and(
        eq(ministryMembership.volunteerId, volunteerId),
        eq(ministryMembership.ministryId, ministryId),
      ),
    )
    .limit(1);
  if (!membership) throw new Error('membership not found');

  const checkRow = await buildAvailabilityCheck({
    db: schedulingTestDb,
    churchId,
    cycleId: cycle.id,
    ministryMembershipId: membership.id,
  });

  return { event: graph.event, shift: shiftRow, check: checkRow };
}

describe('DrizzleUnavailableShiftRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('replaceUnavailableShiftsForCheck creates unavailable shifts that listUnavailableShiftsByCheck, listByVolunteerForEvent, and listByVolunteers can read', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { event, shift, check } = await seedCheckWithShift(
      seed.churchAId,
      seed.ministryAId,
      seed.adminVolunteerId,
    );
    const repo = new DrizzleUnavailableShiftRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);

    await repo.replaceUnavailableShiftsForCheck({
      churchId,
      availabilityCheckId: AvailabilityCheckId.from(check.id),
      shiftIds: [ShiftId.from(shift.id)],
    });

    const unavailableShifts = await repo.listUnavailableShiftsByCheck({
      churchId,
      availabilityCheckId: AvailabilityCheckId.from(check.id),
    });
    expect(unavailableShifts).toHaveLength(1);
    expect(unavailableShifts[0]?.shiftId).toBe(shift.id);
    expect(unavailableShifts[0]?.volunteerId).toBe(seed.adminVolunteerId);

    const byVolunteerForEvent = await repo.listByVolunteerForEvent(
      churchId,
      VolunteerId.from(seed.adminVolunteerId),
      EventId.from(event.id),
    );
    expect(byVolunteerForEvent).toHaveLength(1);

    const byVolunteers = await repo.listByVolunteers(churchId, [
      VolunteerId.from(seed.adminVolunteerId),
    ]);
    expect(byVolunteers).toHaveLength(1);
  });

  it('replaceUnavailableShiftsForCheck with an empty shiftIds array clears existing unavailable shifts (delete-then-return)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { shift, check } = await seedCheckWithShift(
      seed.churchAId,
      seed.ministryAId,
      seed.adminVolunteerId,
    );
    const repo = new DrizzleUnavailableShiftRepository({
      db: schedulingTestDb,
    });
    const churchId = ChurchId.from(seed.churchAId);
    const availabilityCheckId = AvailabilityCheckId.from(check.id);

    await repo.replaceUnavailableShiftsForCheck({
      churchId,
      availabilityCheckId,
      shiftIds: [ShiftId.from(shift.id)],
    });
    expect(
      await repo.listUnavailableShiftsByCheck({
        churchId,
        availabilityCheckId,
      }),
    ).toHaveLength(1);

    await repo.replaceUnavailableShiftsForCheck({
      churchId,
      availabilityCheckId,
      shiftIds: [],
    });
    expect(
      await repo.listUnavailableShiftsByCheck({
        churchId,
        availabilityCheckId,
      }),
    ).toHaveLength(0);
  });

  it('listByVolunteers returns [] immediately for an empty volunteerIds array', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleUnavailableShiftRepository({
      db: schedulingTestDb,
    });
    const result = await repo.listByVolunteers(
      ChurchId.from(seed.churchAId),
      [],
    );
    expect(result).toEqual([]);
  });
});

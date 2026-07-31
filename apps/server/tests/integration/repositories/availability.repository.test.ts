import {
  availabilityCheck,
  ministryVolunteer,
  shift as shiftTable,
} from '@church/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AvailabilityCheckId,
  ChurchId,
  EventId,
  ShiftId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { DrizzleAvailabilityRepository } from '../../../src/infrastructure/repositories/drizzle-availability.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

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
    startDate: new Date('2026-08-02T09:00:00.000Z'),
    endDate: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });

  const [shiftRow] = await schedulingTestDb
    .insert(shiftTable)
    .values({
      churchId,
      participationId: graph.participation.id,
      timeSlotId: graph.slot.id,
      startTime: graph.slot.startTime,
      endTime: graph.slot.endTime,
      label: 'Whole slot',
    })
    .returning();
  if (!shiftRow) throw new Error('shift seed failed');

  const [membership] = await schedulingTestDb
    .select()
    .from(ministryVolunteer)
    .where(
      and(
        eq(ministryVolunteer.volunteerId, volunteerId),
        eq(ministryVolunteer.ministryId, ministryId),
      ),
    )
    .limit(1);
  if (!membership) throw new Error('membership not found');

  const [checkRow] = await schedulingTestDb
    .insert(availabilityCheck)
    .values({
      churchId,
      planningCycleId: cycle.id,
      ministryVolunteerId: membership.id,
    })
    .returning();
  if (!checkRow) throw new Error('availability check seed failed');

  return { event: graph.event, shift: shiftRow, check: checkRow };
}

describe('DrizzleAvailabilityRepository', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('replaceMarksForCheck creates marks that listMarksByCheck, listByVolunteerForEvent, and listByVolunteers can read', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { event, shift, check } = await seedCheckWithShift(
      seed.churchAId,
      seed.ministryAId,
      seed.adminVolunteerId,
    );
    const repo = new DrizzleAvailabilityRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);

    await repo.replaceMarksForCheck({
      churchId,
      availabilityCheckId: AvailabilityCheckId.from(check.id),
      shiftIds: [ShiftId.from(shift.id)],
    });

    const marks = await repo.listMarksByCheck({
      churchId,
      availabilityCheckId: AvailabilityCheckId.from(check.id),
    });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.shiftId).toBe(shift.id);
    expect(marks[0]?.volunteerId).toBe(seed.adminVolunteerId);

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

  it('replaceMarksForCheck with an empty shiftIds array clears existing marks (delete-then-return)', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { shift, check } = await seedCheckWithShift(
      seed.churchAId,
      seed.ministryAId,
      seed.adminVolunteerId,
    );
    const repo = new DrizzleAvailabilityRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const availabilityCheckId = AvailabilityCheckId.from(check.id);

    await repo.replaceMarksForCheck({
      churchId,
      availabilityCheckId,
      shiftIds: [ShiftId.from(shift.id)],
    });
    expect(
      await repo.listMarksByCheck({ churchId, availabilityCheckId }),
    ).toHaveLength(1);

    await repo.replaceMarksForCheck({
      churchId,
      availabilityCheckId,
      shiftIds: [],
    });
    expect(
      await repo.listMarksByCheck({ churchId, availabilityCheckId }),
    ).toHaveLength(0);
  });

  it('listByVolunteers returns [] immediately for an empty volunteerIds array', async () => {
    const seed = await seedSchedulingPhase3Base();
    const repo = new DrizzleAvailabilityRepository({ db: schedulingTestDb });
    const result = await repo.listByVolunteers(
      ChurchId.from(seed.churchAId),
      [],
    );
    expect(result).toEqual([]);
  });
});

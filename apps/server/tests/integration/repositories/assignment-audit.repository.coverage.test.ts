import { timeSlot } from '@church/db';
import { fromDate } from '@church/time';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildRole } from '../../../seeds/builders/ministry';
import {
  buildAssignment,
  buildShift,
} from '../../../seeds/builders/scheduling';
import {
  AssignmentId,
  ChurchId,
  EventId,
  UserId,
} from '../../../src/domain/branded-ids';
import { DrizzleAssignmentAuditRepository } from '../../../src/infrastructure/repositories/drizzle-assignment-audit.repository';
import {
  createSchedulingPhase3Cycle,
  createSchedulingPhase3EventGraph,
  resetSchedulingPhase3Db,
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '../../scheduling-reshape/setup';

async function seedAssignment(input: {
  churchId: string;
  ministryId: string;
  volunteerId: string;
  label?: string | null;
}) {
  const cycle = await createSchedulingPhase3Cycle({
    churchId: input.churchId,
    name: `Cycle-${Math.random().toString(36).slice(2, 8)}`,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
  });
  const graph = await createSchedulingPhase3EventGraph({
    churchId: input.churchId,
    cycleId: cycle.id,
    ministryId: input.ministryId,
    title: 'Sunday Service',
    start: new Date('2026-08-02T09:00:00.000Z'),
    end: new Date('2026-08-02T11:00:00.000Z'),
    status: 'scheduled',
  });

  const shiftRow = await buildShift({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: graph.participation.id,
    timeSlotId: graph.slot.id,
    start: fromDate({ date: graph.slot.startTime }),
    end: fromDate({ date: graph.slot.endTime }),
    label: input.label === undefined ? 'Whole slot' : input.label,
  });

  const roleRow = await buildRole({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryId: input.ministryId,
    name: 'Usher',
  });

  const assignmentRow = await buildAssignment({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: graph.participation.id,
    shiftId: shiftRow.id,
    volunteerId: input.volunteerId,
    roleId: roleRow.id,
    status: 'confirmed',
  });

  return {
    event: graph.event,
    slot: graph.slot,
    shift: shiftRow,
    assignment: assignmentRow,
  };
}

describe('DrizzleAssignmentAuditRepository (extra coverage)', () => {
  beforeEach(async () => {
    await resetSchedulingPhase3Db();
  });

  it('create maps event_published/event_cancelled to status_change and defaults reason to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { assignment: assignmentRow } = await seedAssignment({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      volunteerId: seed.adminVolunteerId,
    });
    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const assignmentId = AssignmentId.from(assignmentRow.id);
    const actorId = UserId.from(seed.adminUserId);

    const published = await repo.create(churchId, {
      assignmentId,
      actorId,
      action: 'event_published',
    });
    expect(published.action).toBe('status_change');
    expect(published.reason).toBeUndefined();

    const cancelled = await repo.create(churchId, {
      assignmentId,
      actorId,
      action: 'event_cancelled',
    });
    expect(cancelled.action).toBe('status_change');

    const created = await repo.create(churchId, {
      assignmentId,
      actorId,
      action: 'created',
      reason: 'initial assignment',
    });
    expect(created.action).toBe('created');
    expect(created.reason).toBe('initial assignment');
  });

  it('listByAssignment, listByChurch, and listByActor all order desc by timestamp', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { assignment: assignmentRow } = await seedAssignment({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      volunteerId: seed.adminVolunteerId,
    });
    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const assignmentId = AssignmentId.from(assignmentRow.id);
    const actorId = UserId.from(seed.adminUserId);

    await repo.create(churchId, { assignmentId, actorId, action: 'created' });
    await repo.create(churchId, {
      assignmentId,
      actorId,
      action: 'status_change',
    });

    const byAssignment = await repo.listByAssignment(churchId, assignmentId);
    expect(byAssignment).toHaveLength(2);
    expect(byAssignment[0]?.action).toBe('status_change');
    expect(byAssignment[1]?.action).toBe('created');

    const byChurch = await repo.listByChurch(churchId);
    expect(byChurch).toHaveLength(2);

    const byActor = await repo.listByActor(churchId, actorId);
    expect(byActor).toHaveLength(2);

    const otherChurchAudits = await repo.listByChurch(
      ChurchId.from(seed.churchBId),
    );
    expect(otherChurchAudits).toEqual([]);
  });

  it('listByEvent returns enriched entries joined across assignment/shift/slot/role/volunteer/actor, falling back to slot start time when the slot has no label', async () => {
    const seed = await seedSchedulingPhase3Base();
    const {
      event,
      slot,
      assignment: assignmentRow,
    } = await seedAssignment({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      volunteerId: seed.adminVolunteerId,
    });
    // Null out the time slot's label to exercise the ISO-start-time fallback.
    await schedulingTestDb
      .update(timeSlot)
      .set({ label: null })
      .where(eq(timeSlot.eventId, event.id));

    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const assignmentId = AssignmentId.from(assignmentRow.id);
    const actorId = UserId.from(seed.adminUserId);

    await repo.create(churchId, {
      assignmentId,
      actorId,
      action: 'created',
      reason: 'assigned',
    });

    const entries = await repo.listByEvent(churchId, EventId.from(event.id));
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.action).toBe('created');
    expect(entry?.reason).toBe('assigned');
    expect(entry?.volunteerId).toBe(seed.adminVolunteerId);
    expect(entry?.volunteerName).toBe('Scheduling Admin');
    expect(entry?.actorName).toBe('Scheduling Admin');
    // Slot has no label, so slotLabel falls back to the ISO start time.
    expect(entry?.slotLabel).toBe(slot.startTime.toISOString());
  });

  it('listByEvent defaults a missing reason to null', async () => {
    const seed = await seedSchedulingPhase3Base();
    const { event, assignment: assignmentRow } = await seedAssignment({
      churchId: seed.churchAId,
      ministryId: seed.ministryAId,
      volunteerId: seed.adminVolunteerId,
    });
    const repo = new DrizzleAssignmentAuditRepository({ db: schedulingTestDb });
    const churchId = ChurchId.from(seed.churchAId);
    const assignmentId = AssignmentId.from(assignmentRow.id);
    const actorId = UserId.from(seed.adminUserId);

    // No `reason` passed in.
    await repo.create(churchId, { assignmentId, actorId, action: 'created' });

    const entries = await repo.listByEvent(churchId, EventId.from(event.id));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.reason).toBeNull();
  });
});

import {
  assignment,
  availability,
  event,
  ministryVolunteer,
  timeSlot,
} from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seed, testDb, truncateAll } from '../repositories/setup';
import { createCaller, promoteToLeader, SEED } from './caller';

// Reproduces the live builder "assign" action: a leader assigns a qualified,
// available volunteer to a future-dated draft slot.
describe('createAssignment happy path (live-builder repro)', () => {
  beforeEach(async () => {
    await truncateAll();
    await seed();
    await promoteToLeader(SEED.volunteerAlice, SEED.ministryAdult);
    // Seed dates are in the past; move event-1 + slot-1 into the future so the
    // EVENT_IN_PAST hard constraint does not fire.
    const start = new Date('2099-01-01T09:00:00Z');
    const end = new Date('2099-01-01T11:00:00Z');
    await testDb
      .update(event)
      .set({ startDate: start, endDate: end })
      .where(eq(event.id, SEED.eventDraft));
    await testDb
      .update(timeSlot)
      .set({ startTime: start, endTime: end })
      .where(eq(timeSlot.id, SEED.slotDraft));
    // Make Bob a member of the ministry (unassigned, qualified via ministry role).
    await testDb.insert(ministryVolunteer).values({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccca7',
      churchId: SEED.church,
      volunteerId: SEED.volunteerBob,
      ministryId: SEED.ministryAdult,
      systemRole: 'volunteer',
      status: 'active',
    });
  });

  it('creates a draft assignment for a qualified member with no conflicts', async () => {
    // Clear seed assignments on the slot so Bob is genuinely unassigned.
    await testDb
      .delete(assignment)
      .where(eq(assignment.slotId, SEED.slotDraft));
    const res = await createCaller(SEED.userAlice).adminLeader.createAssignment(
      {
        timeSlotId: SEED.slotDraft,
        volunteerId: SEED.volunteerBob,
        roleId: SEED.roleUsher,
      },
    );
    expect(res.conflictReport).toBeUndefined();
    expect(res.assignment?.status).toBe('draft');
  });

  it('does not treat an "available" answer as a conflict when a leader assigns themself', async () => {
    await testDb
      .delete(assignment)
      .where(eq(assignment.slotId, SEED.slotDraft));

    await testDb.insert(availability).values({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10',
      churchId: SEED.church,
      volunteerId: SEED.volunteerAlice,
      eventId: SEED.eventDraft,
      type: 'available',
      startTime: new Date('2099-01-01T09:00:00Z'),
      endTime: new Date('2099-01-01T11:00:00Z'),
      isAllDay: false,
    });

    const res = await createCaller(SEED.userAlice).adminLeader.createAssignment(
      {
        timeSlotId: SEED.slotDraft,
        volunteerId: SEED.volunteerAlice,
        roleId: SEED.roleUsher,
      },
    );

    expect(res.conflictReport).toBeUndefined();
    expect(res.assignment?.volunteerId).toBe(SEED.volunteerAlice);
    expect(res.assignment?.status).toBe('draft');
  });

  // Regression: `assignment_slot_volunteer_idx` is now a PARTIAL unique index
  // (active statuses only), so a volunteer who previously DECLINED a slot can be
  // re-assigned / substituted back in without a duplicate-key error.
  it('re-assigns a volunteer who previously DECLINED the same slot (regression)', async () => {
    // Seed assignment-2 = Bob DECLINED on slot-1.
    const res = await createCaller(SEED.userAlice).adminLeader.createAssignment(
      {
        timeSlotId: SEED.slotDraft,
        volunteerId: SEED.volunteerBob,
        roleId: SEED.roleUsher,
      },
    );
    expect(res.assignment?.status).toBe('draft');
  });
});

import { parseInstant } from '@church/time';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbScheduleChangeReader } from '@/application/db-schedule-change-reader';
import { ChurchId, CycleId, ShiftId, VolunteerId } from '@/domain/branded-ids';
import { ASSIGNMENT_STATUS_OPTIONS } from '@/domain/entities/assignment';
import { isEventTimeBlockCancelled } from '@/domain/event-time-block-cancellation';
import type { ScheduleAssignmentSnapshot } from '@/domain/schedule-last-told';
import { isListedAssignment } from '@/domain/services/scheduling/listed-assignment';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { buildRole, buildSector } from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  createSchedulingPhase3Cycle,
  schedulingTestDb as db,
  resetSchedulingPhase3Db,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

const at = (value: string) => parseInstant({ value: `2026-08-${value}:00Z` });
const EVENT_STATUSES = ['scheduled', 'cancelled'] as const;
const BLOCK_STATUSES = ['active', 'cancelled'] as const;
/** No reason, an empty one, and a Volunteer Transfer's own. */
const REASONS = [undefined, '', 'Transferred'];

const assignmentRepository = new DrizzleAssignmentRepository({ db });
const eventRepository = new DrizzlePlanningEventRepository({ db });
// `compareScheduleAssignments` reads nothing, so it needs no repositories.
const scheduleChangeReader = new DbScheduleChangeReader({} as never);

beforeEach(async () => {
  await resetSchedulingPhase3Db();
});

/**
 * Every Event status × EventTimeBlock status × Assignment status × reason, each
 * on its own Shift of a published participation.
 */
async function seedCases() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const ministryId = seed.ministryAId;
  const role = await buildRole({ db, churchId, ministryId, name: 'Sound' });
  const sector = await buildSector({ db, churchId, ministryId, name: 'Booth' });
  const cycle = await createSchedulingPhase3Cycle({
    churchId,
    name: 'August',
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    endDate: new Date('2026-08-31T00:00:00.000Z'),
  });
  const times = { start: at('02T09:00'), end: at('02T11:00') };
  const cases = [];
  for (const eventStatus of EVENT_STATUSES) {
    const event = await buildEvent({
      db,
      churchId,
      cycleId: cycle.id,
      title: `${eventStatus} Event`,
      status: eventStatus,
      ...times,
    });
    const participation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId,
      eventId: event.id,
      state: 'published',
      eventTimeBlockIds: [],
    });
    for (const blockStatus of BLOCK_STATUSES) {
      const block = await buildEventTimeBlock({
        db,
        churchId,
        eventId: event.id,
        status: blockStatus,
        ...times,
      });
      for (const status of ASSIGNMENT_STATUS_OPTIONS) {
        for (const reason of REASONS) {
          const shift = await buildShift({
            db,
            churchId,
            participationId: participation.id,
            eventTimeBlockId: block.id,
            ...times,
          });
          const requirement = await buildShiftRequirement({
            db,
            churchId,
            participationId: participation.id,
            shiftId: shift.id,
            roleId: role.id,
            sectorId: sector.id,
            peopleNeeded: 1,
          });
          const assignment = await buildAssignment({
            db,
            churchId,
            participationId: participation.id,
            shiftId: shift.id,
            volunteerId: seed.adminVolunteerId,
            roleId: role.id,
            shiftRequirementId: requirement.id,
            status,
            reason,
          });
          cases.push({
            eventStatus,
            blockStatus,
            status,
            reason,
            eventId: event.id,
            shiftId: ShiftId.from(shift.id),
            assignmentId: assignment.id,
          });
        }
      }
    }
  }
  return {
    cases,
    churchId: ChurchId.from(churchId),
    cycleId: CycleId.from(cycle.id),
    volunteerId: VolunteerId.from(seed.adminVolunteerId),
  };
}

describe('cancellation rules written both in SQL and in TypeScript', () => {
  it('listPublishedByVolunteer lists what isListedAssignment lists', async () => {
    const { cases, churchId, volunteerId } = await seedCases();
    const judged = cases.map((entry) => {
      const cancelled = isEventTimeBlockCancelled({
        event: { status: entry.eventStatus },
        eventTimeBlock: { status: entry.blockStatus },
      });
      const { status, reason } = entry;
      const listed = isListedAssignment({
        assignment: { status, reason },
        cancelled,
      });
      return { ...entry, cancelled, listed };
    });
    const expected = judged
      .filter(({ listed }) => listed)
      .map(({ assignmentId, cancelled }) => `${assignmentId}:${cancelled}`)
      .sort();
    // Both answers must be present for the comparison to mean anything.
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(cases.length);

    const rows = await assignmentRepository.listPublishedByVolunteer({
      churchId,
      volunteerId,
    });

    const read = rows
      .map(({ assignment, cancelled }) => `${assignment.id}:${cancelled}`)
      .sort();
    expect(read).toEqual(expected);
  });

  it('listCycleCancellations cancels what compareScheduleAssignments cancels', async () => {
    const { cases, churchId, cycleId } = await seedCases();
    const events = await eventRepository.listCycleEvents({ churchId, cycleId });
    // One Volunteer told of each Shift and holding none now: a live Shift shows
    // as a removal, a cancelled one is not compared at all.
    const baseline = cases.map(({ eventId, shiftId }) => ({
      volunteerId: VolunteerId.from(shiftId),
      assignments: [
        {
          shiftId,
          eventId,
          startsAt: at('02T09:00'),
          endsAt: at('02T11:00'),
        } as ScheduleAssignmentSnapshot,
      ],
      toldAt: at('01T00:00'),
    }));

    const changes = scheduleChangeReader.compareScheduleAssignments({
      events,
      baseline,
      current: new Map(),
      at: at('01T00:00'),
    });
    const [cancelled] = await eventRepository.listCycleCancellations({
      churchId,
      cycleIds: [cycleId],
    });

    const liveInTypeScript = changes.map(({ id }) => id as string).sort();
    const liveInSql = cases
      .filter(
        ({ eventId, shiftId }) =>
          !cancelled?.eventIds.includes(eventId as never) &&
          !cancelled?.shiftIds.includes(shiftId),
      )
      .map(({ shiftId }) => shiftId as string)
      .sort();
    expect(liveInSql.length).toBeGreaterThan(0);
    expect(liveInSql.length).toBeLessThan(cases.length);
    expect(liveInSql).toEqual(liveInTypeScript);
  });
});

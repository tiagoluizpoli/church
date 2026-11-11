import { scheduleLastTold, swapRequest } from '@church/db';
import {
  parseCalendarDay,
  parseInstant,
  parseTimeOfDay,
  toInstant,
} from '@church/time';
import {
  ChurchId,
  CycleId,
  EventId,
  EventTimeBlockId,
} from '@/domain/branded-ids';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildConfirmedAvailabilityCheck,
  buildUnavailableShift,
} from '@/seeds/builders/unavailable-shift';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import {
  schedulingTestDb,
  seedSchedulingPhase3Base,
} from '@/tests/scheduling-reshape/setup';

/**
 * The Sent-Cycle cancellation board shared by the cancellation suites: one
 * Sunday with published, unpublished, declined, swap-requested, marked and
 * last-told work.
 */

const db = schedulingTestDb;
const CHURCH_TIME_ZONE = 'America/Sao_Paulo';
export const CHURCH_OCTOBER_1_NOON = '2026-10-01T15:00:00.000Z';

/** A Church-local wall clock on Sunday 2026-10-18 in São Paulo. */
export const at = (time: string) =>
  toInstant({
    day: parseCalendarDay({ value: '2026-10-18' }),
    time: parseTimeOfDay({ value: time }),
    timeZone: CHURCH_TIME_ZONE,
  });

interface SeedVolunteerInput {
  churchId: string;
  ministryId: string;
  name: string;
}

export async function seedVolunteer({
  churchId,
  ministryId,
  name,
}: SeedVolunteerInput) {
  const user = await buildUser({
    db,
    id: `user-${name}`,
    name,
    email: `${name}@test.com`,
  });
  const volunteer = await buildVolunteer({ db, churchId, userId: user.id });
  const membership = await buildMinistryMembership({
    db,
    churchId,
    volunteerId: volunteer.id,
    ministryId,
    ministryAccessLevel: 'volunteer',
    roleIds: [],
  });
  return { volunteer, membership, userId: user.id };
}

interface StaffInput {
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  roleId: string;
  sectorId: string;
  volunteerId: string;
  start: string;
  end: string;
  status: 'draft' | 'pending' | 'confirmed' | 'declined';
}

/** One Shift on an existing block with one Assignment on it. */
export async function staff({
  churchId,
  participationId,
  eventTimeBlockId,
  roleId,
  sectorId,
  volunteerId,
  start,
  end,
  status,
}: StaffInput) {
  const shiftRow = await buildShift({
    db,
    churchId,
    participationId,
    eventTimeBlockId,
    start: at(start),
    end: at(end),
  });
  const requirement = await buildShiftRequirement({
    db,
    churchId,
    participationId,
    shiftId: shiftRow.id,
    roleId,
    sectorId,
    peopleNeeded: 1,
  });
  const booked = await buildAssignment({
    db,
    churchId,
    participationId,
    shiftId: shiftRow.id,
    volunteerId,
    roleId,
    shiftRequirementId: requirement.id,
    status,
  });
  return { shift: shiftRow, assignment: booked };
}

/**
 * A Sent Cycle with Sunday 09:00–12:00 (Welcome 09–10, Service 10–12).
 * Ministry A is published: Ana (Welcome, confirmed, open SwapRequest), Bia
 * (Service, pending) and Dani (Service, declined). Media is unpublished:
 * Caio (Service, confirmed). Edu only marked both Shifts unavailable. Ana's
 * last-told snapshot also holds an unrelated entry.
 */
export async function seedSentSunday() {
  const seed = await seedSchedulingPhase3Base();
  const churchId = seed.churchAId;
  const cycle = await buildCycle({
    db,
    churchId,
    name: 'October',
    state: 'sent',
    startDate: parseCalendarDay({ value: '2026-10-12' }),
    endDate: parseCalendarDay({ value: '2026-10-25' }),
  });
  const sunday = await buildEvent({
    db,
    churchId,
    cycleId: cycle.id,
    title: 'Sunday',
    start: at('09:00'),
    end: at('12:00'),
    status: 'scheduled',
  });
  const welcome = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: at('09:00'),
    end: at('10:00'),
    label: 'Welcome',
  });
  const service = await buildEventTimeBlock({
    db,
    churchId,
    eventId: sunday.id,
    start: at('10:00'),
    end: at('12:00'),
    label: 'Service',
  });
  const media = await buildMinistry({ db, churchId, name: 'Zeta Media' });
  const published = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: seed.ministryAId,
    eventId: sunday.id,
    state: 'published',
    eventTimeBlockIds: [welcome.id, service.id],
  });
  const unpublished = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: media.id,
    eventId: sunday.id,
    state: 'assigning',
    eventTimeBlockIds: [service.id],
  });
  const usher = await buildRole({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Usher',
  });
  const camera = await buildRole({
    db,
    churchId,
    ministryId: media.id,
    name: 'Camera',
  });
  const lobby = await buildSector({
    db,
    churchId,
    ministryId: seed.ministryAId,
    name: 'Lobby',
  });
  const booth = await buildSector({
    db,
    churchId,
    ministryId: media.id,
    name: 'Booth',
  });
  const ana = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'ana',
  });
  const bia = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'bia',
  });
  const dani = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'dani',
  });
  const caio = await seedVolunteer({
    churchId,
    ministryId: media.id,
    name: 'caio',
  });
  const edu = await seedVolunteer({
    churchId,
    ministryId: seed.ministryAId,
    name: 'edu',
  });
  const ministryA = { participationId: published.id, roleId: usher.id };
  const anaWelcome = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: welcome.id,
    volunteerId: ana.volunteer.id,
    start: '09:00',
    end: '10:00',
    status: 'confirmed',
  });
  const biaService = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: service.id,
    volunteerId: bia.volunteer.id,
    start: '10:00',
    end: '12:00',
    status: 'pending',
  });
  const daniService = await staff({
    churchId,
    ...ministryA,
    sectorId: lobby.id,
    eventTimeBlockId: service.id,
    volunteerId: dani.volunteer.id,
    start: '10:00',
    end: '11:00',
    status: 'declined',
  });
  const caioService = await staff({
    churchId,
    participationId: unpublished.id,
    roleId: camera.id,
    sectorId: booth.id,
    eventTimeBlockId: service.id,
    volunteerId: caio.volunteer.id,
    start: '10:00',
    end: '12:00',
    status: 'confirmed',
  });
  await db.insert(swapRequest).values({
    churchId,
    assignmentId: anaWelcome.assignment.id,
    status: 'open',
    raisedBy: ana.userId,
  });
  const check = await buildConfirmedAvailabilityCheck({
    db,
    churchId,
    cycleId: cycle.id,
    ministryMembershipId: edu.membership.id,
    id: crypto.randomUUID(),
    confirmedAt: parseInstant({ value: CHURCH_OCTOBER_1_NOON }),
  });
  for (const shiftId of [anaWelcome.shift.id, biaService.shift.id]) {
    await buildUnavailableShift({
      db,
      churchId,
      availabilityCheckId: check.id,
      shiftId,
    });
  }
  const toldAt = new Date(CHURCH_OCTOBER_1_NOON);
  const unrelated = { assignmentId: crypto.randomUUID(), eventTitle: 'Other' };
  await db.insert(scheduleLastTold).values([
    {
      churchId,
      ministryId: seed.ministryAId,
      cycleId: cycle.id,
      volunteerId: ana.volunteer.id,
      assignments: [
        { assignmentId: anaWelcome.assignment.id, eventTitle: 'Sunday' },
        unrelated,
      ],
      toldAt,
    },
    {
      churchId,
      ministryId: seed.ministryAId,
      cycleId: cycle.id,
      volunteerId: bia.volunteer.id,
      assignments: [
        { assignmentId: biaService.assignment.id, eventTitle: 'Sunday' },
      ],
      toldAt,
    },
  ]);

  return {
    seed,
    churchId: ChurchId.from(churchId),
    cycleId: CycleId.from(cycle.id),
    eventId: EventId.from(sunday.id),
    welcomeId: EventTimeBlockId.from(welcome.id),
    serviceId: EventTimeBlockId.from(service.id),
    media,
    ministryA,
    lobbyId: lobby.id,
    ana,
    bia,
    caio,
    dani,
    edu,
    anaWelcome,
    biaService,
    daniService,
    caioService,
    unrelated,
    toldAt,
  };
}

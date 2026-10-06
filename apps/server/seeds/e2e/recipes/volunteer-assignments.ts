import { addChurchMember } from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  type Instant,
  parseTimeOfDay,
  toInstant,
} from '@church/time';
import { hashPassword } from 'better-auth/crypto';
import { SEED_PERSONA_PASSWORD } from '../../blueprints/credentials';
import { buildProvisionedChurch } from '../../builders/church';
import { buildAuthenticatableUser } from '../../builders/identity';
import { buildMinistry, buildRole } from '../../builders/ministry';
import {
  buildAssignment,
  buildEvent,
  buildMinistryParticipation,
  buildPlanningCycle,
  buildShift,
  buildSlotRequirement,
  buildTimeSlot,
} from '../../builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '../../builders/volunteer';
import type { SeededChurchSummary, SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  E2E_JOURNEY_TIMEZONE,
  type E2eJourneyRootKinds,
  journeySeedId,
  journeyTag,
  resolveJourneyRoots,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.volunteerAssignments;
const CHURCH_KIND = 'church';
const VOLUNTEER_USER_KIND = 'volunteer-user';
const ROOT_KINDS: E2eJourneyRootKinds = {
  churchKinds: [CHURCH_KIND],
  userKinds: [VOLUNTEER_USER_KIND],
};

const EVENT_OFFSET_DAYS = 7;
const CYCLE_LENGTH_DAYS = 14;
const EVENT_TITLE = 'Culto de Domingo';
const MINISTRY_NAME = 'Recepção';
const ROLE_NAME = 'Recepcionista';

export interface VolunteerAssignmentsPersona {
  userId: string;
  email: string;
  password: string;
  name: string;
  volunteerId: string;
}

export interface VolunteerAssignmentsAssignment {
  id: string;
  eventId: string;
  eventTitle: string;
  ministryName: string;
  roleName: string;
  startsAt: Instant;
  endsAt: Instant;
}

export interface VolunteerAssignmentsJourney {
  anchor: CalendarDay;
  church: SeededChurchSummary;
  volunteer: VolunteerAssignmentsPersona;
  assignment: VolunteerAssignmentsAssignment;
}

interface SeedIdInput {
  kind: string;
}

export function createVolunteerAssignmentsRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<VolunteerAssignmentsJourney> {
  if (journeyKey.length === 0) {
    throw new Error('A journey recipe needs a non-empty journey key.');
  }

  const idOf = ({ kind }: SeedIdInput): string =>
    journeySeedId({
      recipeName: RECIPE_NAME,
      journeyKey,
      kind,
    });

  const tag = journeyTag({
    recipeName: RECIPE_NAME,
    journeyKey,
  });
  const churchId = idOf({ kind: CHURCH_KIND });
  const volunteerUserId = idOf({ kind: VOLUNTEER_USER_KIND });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<VolunteerAssignmentsJourney> {
    const slug = `e2e-${tag}`;
    const volunteerName = 'Rafael Moura';
    const volunteerEmail = `volunteer@${tag}.e2e.test`;

    const { church } = await buildProvisionedChurch({
      db,
      id: churchId,
      name: `Igreja E2E ${tag}`,
      slug,
      timezone: E2E_JOURNEY_TIMEZONE,
      adminEmail: `admin@${tag}.e2e.test`,
      adminInvitationId: idOf({ kind: 'admin-invitation' }),
    });

    const passwordHash = await hashPassword(SEED_PERSONA_PASSWORD);
    const volunteerUser = await buildAuthenticatableUser({
      db,
      id: volunteerUserId,
      name: volunteerName,
      email: volunteerEmail,
      passwordHash,
    });
    // Direct state by purpose (ADR 0006): a Volunteer's real origin is a
    // redeemed Ministry Invitation; the journey starts after that happened.
    await addChurchMember({
      db,
      churchId: church.id,
      userId: volunteerUser.id,
      accessLevel: 'member',
      id: idOf({ kind: 'volunteer-church-membership' }),
    });
    const volunteer = await buildVolunteer({
      db,
      churchId: church.id,
      userId: volunteerUser.id,
      id: idOf({ kind: 'volunteer' }),
    });

    const ministry = await buildMinistry({
      db,
      churchId: church.id,
      id: idOf({ kind: 'ministry' }),
      name: MINISTRY_NAME,
    });
    const role = await buildRole({
      db,
      churchId: church.id,
      ministryId: ministry.id,
      id: idOf({ kind: 'role' }),
      name: ROLE_NAME,
    });
    await buildMinistryMembership({
      db,
      churchId: church.id,
      volunteerId: volunteer.id,
      ministryId: ministry.id,
      id: idOf({ kind: 'ministry-membership' }),
      ministryAccessLevel: 'volunteer',
      roleIds: [role.id],
      teams: [],
    });

    const eventDay = addCalendarDays({ day: anchor, days: EVENT_OFFSET_DAYS });
    const startsAt = toInstant({
      day: eventDay,
      time: parseTimeOfDay({ value: '09:00' }),
      timeZone: E2E_JOURNEY_TIMEZONE,
    });
    const endsAt = toInstant({
      day: eventDay,
      time: parseTimeOfDay({ value: '11:00' }),
      timeZone: E2E_JOURNEY_TIMEZONE,
    });

    const cycle = await buildPlanningCycle({
      db,
      churchId: church.id,
      id: idOf({ kind: 'planning-cycle' }),
      name: 'Ciclo E2E',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'locked',
    });
    const event = await buildEvent({
      db,
      churchId: church.id,
      planningCycleId: cycle.id,
      id: idOf({ kind: 'event' }),
      title: EVENT_TITLE,
      start: startsAt,
      end: endsAt,
      status: 'scheduled',
      eventType: 'hourly',
    });
    const timeSlot = await buildTimeSlot({
      db,
      churchId: church.id,
      eventId: event.id,
      id: idOf({ kind: 'time-slot' }),
      start: startsAt,
      end: endsAt,
    });
    const participation = await buildMinistryParticipation({
      db,
      churchId: church.id,
      ministryId: ministry.id,
      eventId: event.id,
      id: idOf({ kind: 'participation' }),
      state: 'published',
      timeSlotIds: [timeSlot.id],
    });
    const shift = await buildShift({
      db,
      churchId: church.id,
      participationId: participation.id,
      timeSlotId: timeSlot.id,
      id: idOf({ kind: 'shift' }),
      start: startsAt,
      end: endsAt,
    });
    await buildSlotRequirement({
      db,
      churchId: church.id,
      participationId: participation.id,
      shiftId: shift.id,
      roleId: role.id,
      id: idOf({ kind: 'slot-requirement' }),
      requiredCount: 1,
    });
    const assignment = await buildAssignment({
      db,
      churchId: church.id,
      participationId: participation.id,
      shiftId: shift.id,
      volunteerId: volunteer.id,
      roleId: role.id,
      id: idOf({ kind: 'assignment' }),
      status: 'confirmed',
    });

    return {
      anchor,
      church: { id: church.id, slug: church.slug },
      volunteer: {
        userId: volunteerUser.id,
        email: volunteerUser.email,
        password: SEED_PERSONA_PASSWORD,
        name: volunteerUser.name,
        volunteerId: volunteer.id,
      },
      assignment: {
        id: assignment.id,
        eventId: event.id,
        eventTitle: event.title,
        ministryName: ministry.name,
        roleName: role.name,
        startsAt,
        endsAt,
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: resolveJourneyRoots({
      recipeName: RECIPE_NAME,
      journeyKey,
      rootKinds: ROOT_KINDS,
    }),
    load,
  };
}

import { addCalendarDays, type CalendarDay } from '@church/time';
import {
  type AssignmentStatus,
  buildAssignment,
  buildCycle,
} from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  type AssignChurch,
  type AssignChurchPlan,
  type AssignMinistryMembershipPlan,
  type AssignPoolVolunteer,
  type AssignVolunteerPlan,
  assignChurchRootKinds,
  buildAssignChurch,
  EVENT_END_TIME,
  EVENT_START_TIME,
} from './assign-church';
import {
  type AssignCycleSummary,
  type AssignEvent,
  buildAssignEvent,
} from './assign-event';

/**
 * The cycle board a ChurchAdmin leader schedules (#329: smoke,
 * builder-event-time-block-focus, a11y-builder): one Worship cycle with three Events on
 * different days.
 *
 * - `service`: a published Participation needing two Ushers, all open. The
 *   board's first requirement, which smoke and builder-event-time-block-focus fill.
 * - `teamService`: a draft Event at `availability_requested`, needing one
 *   Greeter and one Usher.
 * - `assignedService`: read-only for every journey — a published Host seat
 *   for three, holding a pending, a confirmed and a declined assignment, so
 *   the accessibility scan covers assignment chips.
 *
 * Ushers, Greeters and Hosts are disjoint pools, each qualified for its one
 * Role. Six Ushers and six Greeters is one more than the assignment picker's
 * five recommendations, so its plain candidate list is never empty; disjoint
 * pools mean a pick for one Role never collides with an assignment made for
 * another.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.assignBoard;
const CYCLE_LENGTH_DAYS = 28;
const SERVICE_OFFSET_DAYS = 7;
const TEAM_SERVICE_OFFSET_DAYS = 10;
const ASSIGNED_SERVICE_OFFSET_DAYS = 13;

const USHER_NAMES = [
  'André Souza',
  'Bruno Costa',
  'Carla Dias',
  'Daniel Rocha',
  'Elisa Moreira',
  'Fábio Nunes',
] as const;
const GREETER_NAMES = [
  'Gabriela Alves',
  'Heitor Lima',
  'Isabela Freitas',
  'João Pires',
  'Karina Melo',
  'Lucas Teixeira',
] as const;

interface PoolPlanInput {
  keyPrefix: string;
  names: readonly string[];
  membership: AssignMinistryMembershipPlan;
}

/** One pool Volunteer per name, keyed `<keyPrefix><n>`, all alike. */
function poolPlan({
  keyPrefix,
  names,
  membership,
}: PoolPlanInput): Record<string, AssignVolunteerPlan> {
  return Object.fromEntries(
    names.map((name, index) => [
      `${keyPrefix}${index + 1}`,
      { name, memberships: [membership] },
    ]),
  );
}

const HOST_MEMBERSHIP = {
  ministry: 'worship',
  accessLevel: 'volunteer',
  roles: ['host'],
} as const satisfies AssignMinistryMembershipPlan;

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: {
        usher: 'Recepcionista',
        greeter: 'Acolhedor',
        host: 'Anfitrião',
      },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      // Leads the Ministry but qualifies for no Role, so every candidate on
      // the board is a pool Volunteer.
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
  },
  pool: {
    ...poolPlan({
      keyPrefix: 'usher',
      names: USHER_NAMES,
      membership: {
        ministry: 'worship',
        accessLevel: 'volunteer',
        roles: ['usher'],
      },
    }),
    ...poolPlan({
      keyPrefix: 'greeter',
      names: GREETER_NAMES,
      membership: {
        ministry: 'worship',
        accessLevel: 'volunteer',
        roles: ['greeter'],
      },
    }),
    hostPending: { name: 'Mariana Duarte', memberships: [HOST_MEMBERSHIP] },
    hostConfirmed: { name: 'Nicolas Ramos', memberships: [HOST_MEMBERSHIP] },
    hostDeclined: { name: 'Olívia Prates', memberships: [HOST_MEMBERSHIP] },
  },
} as const satisfies AssignChurchPlan;

interface HostAssignmentPlan {
  volunteer: AssignPoolVolunteer;
  status: AssignmentStatus;
}

export interface AssignBoardAssignment {
  id: string;
  volunteerId: string;
  status: AssignmentStatus;
}

export interface AssignedServiceEvent extends AssignEvent<'host'> {
  /** Pending, confirmed and declined, in that order. */
  assignments: AssignBoardAssignment[];
}

export interface AssignBoardEvents {
  service: AssignEvent<'usher'>;
  teamService: AssignEvent<'greeter' | 'usher'>;
  assignedService: AssignedServiceEvent;
}

export interface AssignBoardJourney extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: AssignCycleSummary;
  events: AssignBoardEvents;
}

export function createAssignBoardRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<AssignBoardJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<AssignBoardJourney> {
    const base = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;

    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo do Quadro',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'sent',
    });

    const service = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'service',
      title: 'Culto de Domingo',
      day: addCalendarDays({ day: anchor, days: SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'published',
      requirements: {
        usher: {
          roleId: worship.roles.usher.id,
          peopleNeeded: 2,
          sectorId: worship.sectors.main.id,
        },
      },
    });
    const teamService = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'team-service',
      title: 'Culto da Equipe',
      day: addCalendarDays({ day: anchor, days: TEAM_SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'availability_requested',
      requirements: {
        greeter: {
          roleId: worship.roles.greeter.id,
          peopleNeeded: 1,
          sectorId: worship.sectors.main.id,
        },
        usher: {
          roleId: worship.roles.usher.id,
          peopleNeeded: 1,
          sectorId: worship.sectors.main.id,
        },
      },
    });

    const assignedEvent = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: worship.id,
      key: 'assigned-service',
      title: 'Culto Escalado',
      day: addCalendarDays({ day: anchor, days: ASSIGNED_SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'scheduled',
      participationState: 'published',
      requirements: {
        host: {
          roleId: worship.roles.host.id,
          peopleNeeded: 3,
          sectorId: worship.sectors.main.id,
        },
      },
    });
    const hostAssignments: HostAssignmentPlan[] = [
      { volunteer: base.pool.hostPending, status: 'pending' },
      { volunteer: base.pool.hostConfirmed, status: 'confirmed' },
      { volunteer: base.pool.hostDeclined, status: 'declined' },
    ];
    const assignments: AssignBoardAssignment[] = [];
    for (const { volunteer, status } of hostAssignments) {
      const row = await buildAssignment({
        db,
        churchId,
        participationId: assignedEvent.participationId,
        shiftId: assignedEvent.shiftId,
        volunteerId: volunteer.volunteerId,
        roleId: worship.roles.host.id,
        id: idOf({ kind: `assignment:assigned-service:${status}` }),
        status,
      });
      assignments.push({
        id: row.id,
        volunteerId: row.volunteerId,
        status: row.status,
      });
    }

    return {
      anchor,
      ...base,
      cycle: { id: cycle.id, name: cycle.name },
      events: {
        service,
        teamService,
        assignedService: { ...assignedEvent, assignments },
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}

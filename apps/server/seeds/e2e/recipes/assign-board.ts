import { addCalendarDays, type CalendarDay } from '@church/time';
import {
  type AssignmentStatus,
  buildAssignment,
  buildPlanningCycle,
} from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  buildRosteringChurch,
  EVENT_END_TIME,
  EVENT_START_TIME,
  type RosteringChurch,
  type RosteringChurchPlan,
  type RosteringMinistryMembershipPlan,
  type RosteringPoolVolunteer,
  type RosteringVolunteerPlan,
  rosteringChurchRootKinds,
} from './rostering-church';
import {
  buildRosteringEvent,
  type RosteringCycleSummary,
  type RosteringEvent,
} from './rostering-event';

/**
 * The cycle board a ChurchAdmin leader rosters (#329: smoke,
 * builder-slot-focus, a11y-builder): one Worship cycle with three Events on
 * different days.
 *
 * - `service`: a published Participation needing two Ushers, all open. The
 *   board's first requirement, which smoke and builder-slot-focus fill.
 * - `teamService`: a draft Event at `availability_fired`, needing one Team
 *   Alpha Greeter and one Usher.
 * - `rosteredService`: read-only for every journey — a published Host seat
 *   for three, holding a pending, a confirmed and a declined assignment, so
 *   the accessibility scan covers assignment chips.
 *
 * Ushers, Greeters and Hosts are disjoint pools, each qualified for its one
 * Role. Six Ushers and six Greeters is one more than the assignment picker's
 * five recommendations, so its plain candidate list is never empty; disjoint
 * pools mean a pick for one Role never collides with an assignment made for
 * another.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.rosteringBoard;
const CYCLE_LENGTH_DAYS = 28;
const SERVICE_OFFSET_DAYS = 7;
const TEAM_SERVICE_OFFSET_DAYS = 10;
const ROSTERED_SERVICE_OFFSET_DAYS = 13;

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
  membership: RosteringMinistryMembershipPlan;
}

/** One pool Volunteer per name, keyed `<keyPrefix><n>`, all alike. */
function poolPlan({
  keyPrefix,
  names,
  membership,
}: PoolPlanInput): Record<string, RosteringVolunteerPlan> {
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
  teams: [],
} as const satisfies RosteringMinistryMembershipPlan;

const PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: {
        usher: 'Recepcionista',
        greeter: 'Acolhedor',
        host: 'Anfitrião',
      },
      teams: { alpha: 'Equipe Alfa' },
    },
  },
  personas: {
    leader: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      // Leads the Ministry but qualifies for no Role, so every candidate on
      // the board is a pool Volunteer.
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [], teams: [] },
      ],
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
        teams: [],
      },
    }),
    ...poolPlan({
      keyPrefix: 'greeter',
      names: GREETER_NAMES,
      membership: {
        ministry: 'worship',
        accessLevel: 'volunteer',
        roles: ['greeter'],
        teams: [{ team: 'alpha', accessLevel: 'member' }],
      },
    }),
    hostPending: { name: 'Mariana Duarte', memberships: [HOST_MEMBERSHIP] },
    hostConfirmed: { name: 'Nicolas Ramos', memberships: [HOST_MEMBERSHIP] },
    hostDeclined: { name: 'Olívia Prates', memberships: [HOST_MEMBERSHIP] },
  },
} as const satisfies RosteringChurchPlan;

interface HostAssignmentPlan {
  volunteer: RosteringPoolVolunteer;
  status: AssignmentStatus;
}

export interface RosteringBoardAssignment {
  id: string;
  volunteerId: string;
  status: AssignmentStatus;
}

export interface RosteredServiceEvent extends RosteringEvent<'host'> {
  /** Pending, confirmed and declined, in that order. */
  assignments: RosteringBoardAssignment[];
}

export interface RosteringBoardEvents {
  service: RosteringEvent<'usher'>;
  teamService: RosteringEvent<'greeter' | 'usher'>;
  rosteredService: RosteredServiceEvent;
}

export interface RosteringBoardJourney extends RosteringChurch<typeof PLAN> {
  anchor: CalendarDay;
  cycle: RosteringCycleSummary;
  events: RosteringBoardEvents;
}

export function createRosteringBoardRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<RosteringBoardJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<RosteringBoardJourney> {
    const base = await buildRosteringChurch({ db, idOf, tag, plan: PLAN });
    const churchId = base.church.id;
    const { worship } = base.ministries;

    const cycle = await buildPlanningCycle({
      db,
      churchId,
      id: idOf({ kind: 'planning-cycle' }),
      name: 'Ciclo do Quadro',
      startDate: anchor,
      endDate: addCalendarDays({ day: anchor, days: CYCLE_LENGTH_DAYS }),
      state: 'locked',
    });

    const service = await buildRosteringEvent({
      db,
      idOf,
      churchId,
      planningCycleId: cycle.id,
      ministryId: worship.id,
      key: 'service',
      title: 'Culto de Domingo',
      day: addCalendarDays({ day: anchor, days: SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'published',
      requirements: {
        usher: { roleId: worship.roles.usher.id, requiredCount: 2 },
      },
    });
    const teamService = await buildRosteringEvent({
      db,
      idOf,
      churchId,
      planningCycleId: cycle.id,
      ministryId: worship.id,
      key: 'team-service',
      title: 'Culto da Equipe',
      day: addCalendarDays({ day: anchor, days: TEAM_SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'availability_fired',
      requirements: {
        greeter: {
          roleId: worship.roles.greeter.id,
          requiredCount: 1,
          teamId: worship.teams.alpha.id,
        },
        usher: { roleId: worship.roles.usher.id, requiredCount: 1 },
      },
    });

    const rosteredEvent = await buildRosteringEvent({
      db,
      idOf,
      churchId,
      planningCycleId: cycle.id,
      ministryId: worship.id,
      key: 'rostered-service',
      title: 'Culto Escalado',
      day: addCalendarDays({ day: anchor, days: ROSTERED_SERVICE_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'scheduled',
      participationState: 'published',
      requirements: {
        host: { roleId: worship.roles.host.id, requiredCount: 3 },
      },
    });
    const hostAssignments: HostAssignmentPlan[] = [
      { volunteer: base.pool.hostPending, status: 'pending' },
      { volunteer: base.pool.hostConfirmed, status: 'confirmed' },
      { volunteer: base.pool.hostDeclined, status: 'declined' },
    ];
    const assignments: RosteringBoardAssignment[] = [];
    for (const { volunteer, status } of hostAssignments) {
      const row = await buildAssignment({
        db,
        churchId,
        participationId: rosteredEvent.participationId,
        shiftId: rosteredEvent.shiftId,
        volunteerId: volunteer.volunteerId,
        roleId: worship.roles.host.id,
        id: idOf({ kind: `assignment:rostered-service:${status}` }),
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
        rosteredService: { ...rosteredEvent, assignments },
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: rosteringChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}

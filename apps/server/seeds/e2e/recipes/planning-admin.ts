import { parseTimeOfDay } from '@church/time';
import { buildEventTemplate, buildUsualSetup } from '../../builders/planning';
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
  type AssignNamedRow,
  assignChurchRootKinds,
  buildAssignChurch,
} from './assign-church';
import {
  cycleWindow,
  type SchedulingJourneyDates,
} from './scheduling-cycle-window';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.planningAdmin;

/**
 * The Church whose ChurchAdmin plans (#329: cycle administration, the
 * create-event form, template library and Cycle-to-leader handoff): a
 * ChurchAdmin who does not lead, a distinct Worship leader, and a plain
 * Volunteer persona for the denial checks. The Sunday template has a
 * source-bound Usual setup for Worship. It holds no Cycle: the journey
 * creates the Cycles it mutates in its own Church. The cycle-access recipe
 * shares the persona plan, without this template or setup.
 */
export const PLANNING_ADMIN_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      sectors: { main: 'Principal' },
    },
  },
  personas: {
    admin: {
      name: 'Lia Prado',
      churchAccessLevel: 'admin',
      memberships: [],
    },
    leader: {
      name: 'Marina Costa',
      churchAccessLevel: 'member',
      memberships: [{ ministry: 'worship', accessLevel: 'leader', roles: [] }],
    },
    volunteer: {
      name: 'Davi Moreira',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
        },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

export interface PlanningAdminJourney
  extends AssignChurch<typeof PLANNING_ADMIN_PLAN>,
    SchedulingJourneyDates {
  sundayTemplate: AssignNamedRow;
}

export function createPlanningAdminRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PlanningAdminJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<PlanningAdminJourney> {
    const graph = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: PLANNING_ADMIN_PLAN,
    });
    const welcomeBlockId = idOf({ kind: 'template-sunday-block-welcome' });
    const { template } = await buildEventTemplate({
      db,
      churchId: graph.church.id,
      id: idOf({ kind: 'template-sunday' }),
      name: 'J5 Worship',
      weekday: 0,
      blocks: [
        {
          id: welcomeBlockId,
          label: 'Welcome',
          startTime: parseTimeOfDay({ value: '09:00' }),
          endTime: parseTimeOfDay({ value: '09:30' }),
        },
        {
          id: idOf({ kind: 'template-sunday-block-message' }),
          label: 'Message',
          startTime: parseTimeOfDay({ value: '09:30' }),
          endTime: parseTimeOfDay({ value: '10:30' }),
        },
        {
          id: idOf({ kind: 'template-sunday-block-prayer' }),
          label: 'Prayer',
          startTime: parseTimeOfDay({ value: '10:30' }),
          endTime: parseTimeOfDay({ value: '11:00' }),
        },
      ],
    });
    await buildUsualSetup({
      db,
      churchId: graph.church.id,
      id: idOf({ kind: 'usual-setup-welcome' }),
      ministryId: graph.ministries.worship.id,
      sourceTemplateTimeBlockId: welcomeBlockId,
      serves: true,
      shiftSplit: { kind: 'equal', count: 1 },
      headcounts: [
        {
          shiftIndex: 0,
          sectorId: graph.ministries.worship.sectors.main.id,
          roleId: graph.ministries.worship.roles.usher.id,
          peopleNeeded: 1,
        },
      ],
    });
    return {
      anchor,
      ...graph,
      sundayTemplate: { id: template.id, name: template.name },
      cycleWindow: cycleWindow({ anchor }),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: assignChurchRootKinds({ plan: PLANNING_ADMIN_PLAN }),
    }),
    load,
  };
}

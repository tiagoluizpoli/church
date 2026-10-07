import type { CalendarDay } from '@church/time';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  buildRosteringChurch,
  type RosteringChurch,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from './rostering-church';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.ministryWorkspaceIndex;

/**
 * The scheduling capability index of a Ministry leader (#329): a Church with
 * two Ministries, of which the leader persona leads only Worship, so the
 * index must list Worship and neither Care nor church-wide planning. The
 * ChurchAdmin is a separate persona, as every rostering Church needs one.
 */
const PLAN = {
  ministries: {
    worship: { name: 'Louvor', roles: {}, teams: {} },
    care: { name: 'Cuidado', roles: {}, teams: {} },
  },
  personas: {
    admin: {
      name: 'Ana Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
    ministryLeader: {
      name: 'Lia Prado',
      churchAccessLevel: 'member',
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [], teams: [] },
      ],
    },
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

export interface MinistryWorkspaceIndexJourney
  extends RosteringChurch<typeof PLAN> {
  anchor: CalendarDay;
}

export function createMinistryWorkspaceIndexRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<MinistryWorkspaceIndexJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<MinistryWorkspaceIndexJourney> {
    const graph = await buildRosteringChurch({ db, idOf, tag, plan: PLAN });
    return { anchor, ...graph };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: rosteringChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}

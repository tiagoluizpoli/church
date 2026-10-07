import type { CalendarDay } from '@church/time';
import { buildPlanningCycle } from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  addRosteringChurchMembership,
  buildRosteringChurch,
  mergeRootKinds,
  type RosteringChurch,
  type RosteringChurchMembership,
  type RosteringChurchPlan,
  rosteringChurchRootKinds,
} from './rostering-church';
import type { RosteringCycleSummary } from './rostering-event';
import { planningCycleWindow } from './scheduling-cycle-window';

/**
 * The starting graph of the Active Church switching journey (#67): two
 * Churches and one User who belongs to both. In Church A the User is the
 * ChurchAdmin and an active Volunteer of its Worship Ministry, with two
 * Planning Cycles to see; in Church B the User is a plain member with no
 * Ministry, so Church B grants no scheduling access. Both Churches, their
 * Ministries and cycles belong to this journey alone. Names such as 'Louvor'
 * and the cycle names are shared with other recipes, so the negative checks
 * after the switch are meaningful only because Church B's pages show tenant
 * data only: any such name there would come from Church A.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.activeChurchSwitching;
const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';

const CHURCH_A_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
    },
  },
  personas: {
    dualMember: {
      name: 'Davi Duarte',
      churchAccessLevel: 'admin',
      memberships: [
        {
          ministry: 'worship',
          accessLevel: 'volunteer',
          roles: ['usher'],
          teams: [],
        },
      ],
    },
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

/** Church B's own ChurchAdmin; the journey never signs in as them. */
const CHURCH_B_PLAN = {
  ministries: {},
  personas: {
    admin: {
      name: 'Bruna Bastos',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies RosteringChurchPlan;

const ROOT_KINDS = mergeRootKinds({
  rootKinds: [
    rosteringChurchRootKinds({ plan: CHURCH_A_PLAN, scope: CHURCH_A_SCOPE }),
    rosteringChurchRootKinds({ plan: CHURCH_B_PLAN, scope: CHURCH_B_SCOPE }),
  ],
});

/** Church A's two Planning Cycles, back to back from the day after the anchor. */
export interface ActiveChurchSwitchingCycles {
  first: RosteringCycleSummary;
  second: RosteringCycleSummary;
}

export interface ActiveChurchSwitchingJourney {
  anchor: CalendarDay;
  /** `personas.dualMember` is the journey's User. */
  churchA: RosteringChurch<typeof CHURCH_A_PLAN>;
  churchB: RosteringChurch<typeof CHURCH_B_PLAN>;
  /** The dual member's plain Church Membership in Church B. */
  churchBMembership: RosteringChurchMembership;
  cycles: ActiveChurchSwitchingCycles;
}

export function createActiveChurchSwitchingRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<ActiveChurchSwitchingJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<ActiveChurchSwitchingJourney> {
    const churchA = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_A_PLAN,
      scope: CHURCH_A_SCOPE,
    });
    const churchB = await buildRosteringChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_B_PLAN,
      scope: CHURCH_B_SCOPE,
    });
    const churchBMembership = await addRosteringChurchMembership({
      db,
      idOf,
      church: churchB.church,
      userId: churchA.personas.dualMember.userId,
      accessLevel: 'member',
    });

    const firstWindow = planningCycleWindow({ anchor });
    const first = await buildPlanningCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'planning-cycle:first' }),
      name: 'Ciclo Natalino',
      startDate: firstWindow.startDate,
      endDate: firstWindow.endDate,
      state: 'locked',
    });
    // Anchored on the first's end, so it starts the day after: cycles of a
    // Church never overlap.
    const secondWindow = planningCycleWindow({ anchor: firstWindow.endDate });
    const second = await buildPlanningCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'planning-cycle:second' }),
      name: 'Ciclo de Publicação',
      startDate: secondWindow.startDate,
      endDate: secondWindow.endDate,
      state: 'locked',
    });

    return {
      anchor,
      churchA,
      churchB,
      churchBMembership,
      cycles: {
        first: { id: first.id, name: first.name },
        second: { id: second.id, name: second.name },
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}

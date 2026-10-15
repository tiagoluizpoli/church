import type { CalendarDay } from '@church/time';
import { buildCycle } from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  type AssignChurch,
  type AssignChurchMembership,
  type AssignChurchPlan,
  addAssignChurchMembership,
  assignChurchRootKinds,
  buildAssignChurch,
  mergeRootKinds,
} from './assign-church';
import type { AssignCycleSummary } from './assign-event';
import { cycleWindow } from './scheduling-cycle-window';

/**
 * The starting graph of the Active Church switching journey (#67): two
 * Churches and one User who belongs to both. In Church A the User is the
 * ChurchAdmin and an active Volunteer of its Worship Ministry, with two
 * Cycles to see; in Church B the User is a plain member with no
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
      sectors: { main: 'Principal' },
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
        },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

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
} as const satisfies AssignChurchPlan;

const ROOT_KINDS = mergeRootKinds({
  rootKinds: [
    assignChurchRootKinds({ plan: CHURCH_A_PLAN, scope: CHURCH_A_SCOPE }),
    assignChurchRootKinds({ plan: CHURCH_B_PLAN, scope: CHURCH_B_SCOPE }),
  ],
});

/** Church A's two Cycles, back to back from the day after the anchor. */
export interface ActiveChurchSwitchingCycles {
  first: AssignCycleSummary;
  second: AssignCycleSummary;
}

export interface ActiveChurchSwitchingJourney {
  anchor: CalendarDay;
  /** `personas.dualMember` is the journey's User. */
  churchA: AssignChurch<typeof CHURCH_A_PLAN>;
  churchB: AssignChurch<typeof CHURCH_B_PLAN>;
  /** The dual member's plain Church Membership in Church B. */
  churchBMembership: AssignChurchMembership;
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
    const churchA = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_A_PLAN,
      scope: CHURCH_A_SCOPE,
    });
    const churchB = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: CHURCH_B_PLAN,
      scope: CHURCH_B_SCOPE,
    });
    const churchBMembership = await addAssignChurchMembership({
      db,
      idOf,
      church: churchB.church,
      userId: churchA.personas.dualMember.userId,
      accessLevel: 'member',
    });

    const firstWindow = cycleWindow({ anchor });
    const first = await buildCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'cycle:first' }),
      name: 'Ciclo Natalino',
      startDate: firstWindow.startDate,
      endDate: firstWindow.endDate,
      state: 'sent',
    });
    // Anchored on the first's end, so it starts the day after: cycles of a
    // Church never overlap.
    const secondWindow = cycleWindow({ anchor: firstWindow.endDate });
    const second = await buildCycle({
      db,
      churchId: churchA.church.id,
      id: idOf({ kind: 'cycle:second' }),
      name: 'Ciclo de Publicação',
      startDate: secondWindow.startDate,
      endDate: secondWindow.endDate,
      state: 'sent',
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

import { addCalendarDays, type CalendarDay } from '@church/time';
import { buildAssignment, buildCycle } from '../../builders/scheduling';
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
  EVENT_END_TIME,
  EVENT_START_TIME,
  mergeRootKinds,
} from './assign-church';
import {
  type AssignCycleSummary,
  type AssignEvent,
  buildAssignEvent,
} from './assign-event';
import { cycleWindow } from './scheduling-cycle-window';

/**
 * The starting graph of the Volunteer Transfer journey (#65): two Churches
 * and one User who belongs to both and is an active Volunteer of Church B
 * only, holding a future Assignment on Church B's one Usher seat. The
 * journey itself mints Church A's Ministry Invitation, redeems it, and
 * walks the transfer through the product; the graph holds only the history
 * a real dual-membership Volunteer would already have.
 */

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.volunteerTransfer;
const CHURCH_A_SCOPE = 'a';
const CHURCH_B_SCOPE = 'b';
/** Days after the anchor: inside the cycle window, always in the future. */
const SEAT_EVENT_OFFSET_DAYS = 14;

/** Church A's ChurchAdmin mints the Ministry Invitation the journey redeems. */
const CHURCH_A_PLAN = {
  ministries: {
    worship: {
      name: 'Louvor',
      roles: { usher: 'Recepcionista' },
      teams: {},
    },
  },
  personas: {
    admin: {
      name: 'Ana Arruda',
      churchAccessLevel: 'admin',
      memberships: [
        { ministry: 'worship', accessLevel: 'leader', roles: [], teams: [] },
      ],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

/** Church B's ChurchAdmin reads the vacated schedule; `transferee` is the
 * journey's User. */
const CHURCH_B_PLAN = {
  ministries: {
    hospitality: {
      name: 'Hospitalidade',
      roles: { porter: 'Porteiro' },
      teams: {},
    },
  },
  personas: {
    admin: {
      name: 'Bruno Brito',
      churchAccessLevel: 'admin',
      memberships: [
        {
          ministry: 'hospitality',
          accessLevel: 'leader',
          roles: [],
          teams: [],
        },
      ],
    },
    transferee: {
      name: 'Tereza Toledo',
      churchAccessLevel: 'member',
      memberships: [
        {
          ministry: 'hospitality',
          accessLevel: 'volunteer',
          roles: ['porter'],
          teams: [],
        },
      ],
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

/** The Church B seat the transferee holds and the transfer vacates. */
export interface VolunteerTransferSeat {
  cycle: AssignCycleSummary;
  event: AssignEvent<'porter'>;
  assignmentId: string;
}

export interface VolunteerTransferJourney {
  anchor: CalendarDay;
  churchA: AssignChurch<typeof CHURCH_A_PLAN>;
  /** `personas.transferee` is the journey's User. */
  churchB: AssignChurch<typeof CHURCH_B_PLAN>;
  /** The transferee's plain Church Membership in Church A. */
  churchAMembership: AssignChurchMembership;
  seat: VolunteerTransferSeat;
}

export function createVolunteerTransferRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<VolunteerTransferJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<VolunteerTransferJourney> {
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
    const { transferee } = churchB.personas;
    const churchAMembership = await addAssignChurchMembership({
      db,
      idOf,
      church: churchA.church,
      userId: transferee.userId,
      accessLevel: 'member',
    });

    // A draft cycle whose one Event is still being prepared, as a Ministry
    // leader's in-progress schedule is; the transfer withdraws any active
    // Assignment on a future Event Time Block, whatever the cycle's state.
    const churchId = churchB.church.id;
    const { hospitality } = churchB.ministries;
    const window = cycleWindow({ anchor });
    const cycle = await buildCycle({
      db,
      churchId,
      id: idOf({ kind: 'cycle' }),
      name: 'Ciclo Trimestral',
      startDate: window.startDate,
      endDate: window.endDate,
      state: 'draft',
    });
    const event = await buildAssignEvent({
      db,
      idOf,
      churchId,
      cycleId: cycle.id,
      ministryId: hospitality.id,
      key: 'seat',
      title: 'Culto de Transferência',
      day: addCalendarDays({ day: anchor, days: SEAT_EVENT_OFFSET_DAYS }),
      startTime: EVENT_START_TIME,
      endTime: EVENT_END_TIME,
      eventStatus: 'draft',
      participationState: 'preparing',
      requirements: {
        porter: { roleId: hospitality.roles.porter.id, peopleNeeded: 1 },
      },
    });
    const assignment = await buildAssignment({
      db,
      churchId,
      participationId: event.participationId,
      shiftId: event.shiftId,
      volunteerId: transferee.volunteerId,
      roleId: hospitality.roles.porter.id,
      id: idOf({ kind: 'assignment:seat' }),
      status: 'draft',
    });

    return {
      anchor,
      churchA,
      churchB,
      churchAMembership,
      seat: {
        cycle: { id: cycle.id, name: cycle.name },
        event,
        assignmentId: assignment.id,
      },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: ROOT_KINDS }),
    load,
  };
}

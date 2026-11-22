import { churchSlugHistory } from '@church/db';
import {
  addCalendarDays,
  type CalendarDay,
  type Instant,
  parseTimeOfDay,
  type TimeOfDay,
  toInstant,
} from '@church/time';
import {
  buildChurchContactGroups,
  buildChurchContacts,
} from '../../builders/church';
import { buildEventTemplate } from '../../builders/planning';
import {
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildEventTimeBlockMove,
} from '../../builders/scheduling';
import type { SeedRecipeLoadInput } from '../../recipe';
import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  E2E_JOURNEY_TIMEZONE,
  journeyIdentity,
} from '../journey-keys';
import type { E2eJourneyRecipe } from '../journey-recipe';
import {
  type AssignChurch,
  type AssignChurchPlan,
  assignChurchRootKinds,
  buildAssignChurch,
} from './assign-church';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.publicChurchProfile;

/** A Church with only its ChurchAdmin: the page is read signed out. */
const PLAN = {
  ministries: {},
  personas: {
    admin: {
      name: 'Ana Admin',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

const PUBLIC_CONTACT = 'secretaria@publico.e2e.test';
const PRIVATE_CONTACT = 'pastor@privado.e2e.test';
const PROGRAMME_LABEL = 'Culto de celebração';

export interface PublicChurchProfileJourney extends AssignChurch<typeof PLAN> {
  anchor: CalendarDay;
  /** A slug the Church gave up; it redirects to `church.slug`. */
  oldSlug: string;
  publicContact: string;
  privateContact: string;
  programmeLabel: string;
  movedEvent: { title: string };
  cancelledEvent: { title: string };
}

interface AtInput {
  anchor: CalendarDay;
  dayOffset: number;
  time: TimeOfDay;
}

function at({ anchor, dayOffset, time }: AtInput): Instant {
  return toInstant({
    day: addCalendarDays({ day: anchor, days: dayOffset }),
    time,
    timeZone: E2E_JOURNEY_TIMEZONE,
  });
}

/**
 * #1045: a Church whose Public Church Profile exercises the Programme, an
 * upcoming Public Event moved once and another cancelled, a public and a
 * private contact, and an old slug.
 */
export function createPublicChurchProfileRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<PublicChurchProfileJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<PublicChurchProfileJourney> {
    const graph = await buildAssignChurch({ db, idOf, tag, plan: PLAN });
    const churchId = graph.church.id;
    const oldSlug = `e2e-antiga-${tag}`;
    await db.insert(churchSlugHistory).values({ slug: oldSlug, churchId });

    const groupIds = await buildChurchContactGroups({
      db,
      churchId,
      names: [],
    });
    await buildChurchContacts({
      db,
      churchId,
      groupIds,
      contacts: [
        {
          kind: 'email',
          phoneType: null,
          value: PUBLIC_CONTACT,
          description: 'Secretaria',
          isWhatsApp: false,
          isPublic: true,
          group: null,
        },
        {
          kind: 'email',
          phoneType: null,
          value: PRIVATE_CONTACT,
          description: 'Só a liderança',
          isWhatsApp: false,
          isPublic: false,
          group: null,
        },
      ],
    });

    await buildEventTemplate({
      db,
      churchId,
      id: idOf({ kind: 'programme-template' }),
      name: 'Culto de Domingo',
      recurrence: { kind: 'weekly', weekdays: [0] },
      blocks: [
        {
          label: PROGRAMME_LABEL,
          startTime: parseTimeOfDay({ value: '19:00' }),
          endTime: parseTimeOfDay({ value: '20:30' }),
          isPublic: true,
        },
      ],
    });

    // Public Events only show from a sent Cycle.
    const cycleId = idOf({ kind: 'cycle' });
    await buildCycle({
      db,
      churchId,
      id: cycleId,
      name: 'Ciclo público',
      startDate: addCalendarDays({ day: anchor, days: 1 }),
      endDate: addCalendarDays({ day: anchor, days: 14 }),
      state: 'sent',
    });

    const movedTitle = 'Vigília de oração';
    const cancelledTitle = 'Retiro de jovens';
    const sevenPm = parseTimeOfDay({ value: '19:00' });
    const eightThirtyPm = parseTimeOfDay({ value: '20:30' });

    const movedStart = at({ anchor, dayOffset: 3, time: sevenPm });
    const movedEnd = at({ anchor, dayOffset: 3, time: eightThirtyPm });
    const movedEventId = idOf({ kind: 'event:moved' });
    const movedBlockId = idOf({ kind: 'block:moved' });
    await buildEvent({
      db,
      churchId,
      cycleId,
      id: movedEventId,
      title: movedTitle,
      start: movedStart,
      end: movedEnd,
      status: 'scheduled',
    });
    await buildEventTimeBlock({
      db,
      churchId,
      eventId: movedEventId,
      id: movedBlockId,
      start: movedStart,
      end: movedEnd,
      label: movedTitle,
      isPublic: true,
    });
    await buildEventTimeBlockMove({
      db,
      churchId,
      id: idOf({ kind: 'move:moved' }),
      eventTimeBlockId: movedBlockId,
      previousStart: at({ anchor, dayOffset: 2, time: sevenPm }),
      previousEnd: at({ anchor, dayOffset: 2, time: eightThirtyPm }),
      newStart: movedStart,
      newEnd: movedEnd,
      movedAt: at({ anchor, dayOffset: 0, time: sevenPm }),
    });

    const cancelledStart = at({ anchor, dayOffset: 5, time: sevenPm });
    const cancelledEnd = at({ anchor, dayOffset: 5, time: eightThirtyPm });
    const cancelledEventId = idOf({ kind: 'event:cancelled' });
    await buildEvent({
      db,
      churchId,
      cycleId,
      id: cancelledEventId,
      title: cancelledTitle,
      start: cancelledStart,
      end: cancelledEnd,
      status: 'scheduled',
    });
    await buildEventTimeBlock({
      db,
      churchId,
      eventId: cancelledEventId,
      id: idOf({ kind: 'block:cancelled' }),
      start: cancelledStart,
      end: cancelledEnd,
      label: cancelledTitle,
      isPublic: true,
      status: 'cancelled',
    });

    return {
      anchor,
      ...graph,
      oldSlug,
      publicContact: PUBLIC_CONTACT,
      privateContact: PRIVATE_CONTACT,
      programmeLabel: PROGRAMME_LABEL,
      movedEvent: { title: movedTitle },
      cancelledEvent: { title: cancelledTitle },
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({ rootKinds: assignChurchRootKinds({ plan: PLAN }) }),
    load,
  };
}

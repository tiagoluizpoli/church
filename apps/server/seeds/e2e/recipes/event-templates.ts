import { parseTimeOfDay } from '@church/time';
import { buildEventTemplate } from '../../builders/planning';
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
  assignChurchRootKinds,
  buildAssignChurch,
} from './assign-church';

const RECIPE_NAME = E2E_JOURNEY_RECIPE_NAMES.eventTemplates;

/**
 * The Church whose ChurchAdmin manages Event templates (J3, Spec 13): no
 * Ministry and no Cycle, since the library is independent of both. It holds
 * two templates, one per name below, so the list has something to sort; the
 * journey creates the template it mutates (an overnight one) under its own
 * name, so no other journey can collide with it.
 */
export const EVENT_TEMPLATES_PLAN = {
  ministries: {},
  personas: {
    admin: {
      name: 'Marta Lins',
      churchAccessLevel: 'admin',
      memberships: [],
    },
  },
  pool: {},
} as const satisfies AssignChurchPlan;

/** Seeded in reverse alphabetical order so the list's ordering is observable. */
export const EVENT_TEMPLATES_SEEDED = [
  { kind: 'template-wednesday', name: 'Oração de quarta', weekday: 3 },
  { kind: 'template-sunday', name: 'Culto de domingo', weekday: 0 },
] as const;

export interface EventTemplatesJourneyTemplate {
  id: string;
  name: string;
  weekday: number;
  blockCount: number;
}

export interface EventTemplatesJourney
  extends AssignChurch<typeof EVENT_TEMPLATES_PLAN> {
  anchor: string;
  /** The seeded templates, in alphabetical (list) order. */
  templates: EventTemplatesJourneyTemplate[];
}

export function createEventTemplatesRecipe({
  journeyKey,
  anchor,
}: CreateJourneyRecipeInput): E2eJourneyRecipe<EventTemplatesJourney> {
  const { idOf, tag, rootsOf } = journeyIdentity({
    recipeName: RECIPE_NAME,
    journeyKey,
  });

  async function load({
    db,
  }: SeedRecipeLoadInput): Promise<EventTemplatesJourney> {
    const graph = await buildAssignChurch({
      db,
      idOf,
      tag,
      plan: EVENT_TEMPLATES_PLAN,
    });
    const templates: EventTemplatesJourneyTemplate[] = [];
    for (const seeded of EVENT_TEMPLATES_SEEDED) {
      const { template, blocks } = await buildEventTemplate({
        db,
        churchId: graph.church.id,
        id: idOf({ kind: seeded.kind }),
        name: seeded.name,
        weekday: seeded.weekday,
        blocks: [
          {
            id: idOf({ kind: `${seeded.kind}-block` }),
            label: 'Principal',
            startTime: parseTimeOfDay({ value: '10:00' }),
            endTime: parseTimeOfDay({ value: '12:00' }),
          },
        ],
      });
      templates.push({
        id: template.id,
        name: template.name,
        weekday: template.weekday,
        blockCount: blocks.length,
      });
    }
    return {
      anchor,
      ...graph,
      templates: templates.sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    };
  }

  return {
    name: RECIPE_NAME,
    roots: rootsOf({
      rootKinds: assignChurchRootKinds({ plan: EVENT_TEMPLATES_PLAN }),
    }),
    load,
  };
}

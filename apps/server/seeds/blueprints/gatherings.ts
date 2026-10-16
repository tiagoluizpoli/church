import { ESTACIONAMENTO } from './directory/estacionamento';
import { INTERCESSAO } from './directory/intercessao';
import { KIDS } from './directory/kids';
import { PROJECAO } from './directory/projecao';
import type { MinistryBlueprint } from './directory/types';

/** Every recurring TemplateTimeBlock, named by weekday and start. */
export type GatheringBlockKey =
  | 'sunday-08:00'
  | 'sunday-10:30'
  | 'sunday-18:30'
  | 'wednesday-20:00';

export interface TemplateTimeBlockBlueprint {
  key: GatheringBlockKey;
  label: string;
  /** TimeOfDay `HH:mm` in the Church Timezone. */
  startTime: string;
  endTime: string;
}

/** A weekly gathering: applied to a cycle, one Event per matching day. */
export interface EventTemplateBlueprint {
  name: string;
  /** 0 (Sunday) … 6 (Saturday). */
  weekday: number;
  blocks: readonly TemplateTimeBlockBlueprint[];
}

/** One staffed post per Shift: a Role within a Sector. */
export interface StaffingNeed<
  TRole extends string = string,
  TSector extends string = string,
> {
  role: TRole;
  sector: TSector;
  peopleNeeded: number;
  /** Lands on the materialized ShiftRequirement; a profile has no notes. */
  notes?: string;
}

/**
 * A Ministry's UsualSetup: every TemplateTimeBlock is declared, `null`
 * when the Ministry does not serve it. Each served TemplateTimeBlock is one Shift.
 */
export interface MinistryServingRule<
  TRole extends string = string,
  TSector extends string = string,
> {
  ministry: MinistryBlueprint<TRole, TSector>;
  blocks: Record<
    GatheringBlockKey,
    readonly StaffingNeed<TRole, TSector>[] | null
  >;
}

export function serveGatherings<TRole extends string, TSector extends string>(
  rule: MinistryServingRule<TRole, TSector>,
): MinistryServingRule {
  return rule;
}

export interface DynamicParticipationBlueprint<
  TRole extends string = string,
  TSector extends string = string,
> {
  ministry: MinistryBlueprint<TRole, TSector>;
  needs: readonly StaffingNeed<TRole, TSector>[];
}

export function participate<TRole extends string, TSector extends string>(
  participation: DynamicParticipationBlueprint<TRole, TSector>,
): DynamicParticipationBlueprint {
  return participation;
}

/**
 * A monthly gathering, created by hand in the cycle as a dynamic Event: no
 * EventTemplate or profile stands behind it, since monthly recurrence does
 * not exist.
 */
export interface DynamicEventBlueprint {
  title: string;
  weekday: number;
  /** Which matching weekday of the month, 1-based; every month has a 4th. */
  occurrence: 1 | 2 | 3 | 4;
  label: string;
  startTime: string;
  endTime: string;
  participations: readonly DynamicParticipationBlueprint[];
}

export interface GatheringsBlueprint {
  templates: readonly EventTemplateBlueprint[];
  servingRules: readonly MinistryServingRule[];
  dynamicEvents: readonly DynamicEventBlueprint[];
}

const KIDS_BLOCK = [
  { role: 'Líder', sector: 'Kids', peopleNeeded: 1 },
  { role: 'Auxiliar', sector: 'Kids', peopleNeeded: 7 },
  { role: 'Líder', sector: 'Maternal', peopleNeeded: 1 },
  { role: 'Auxiliar', sector: 'Maternal', peopleNeeded: 3 },
] as const;

/** Projeção runs one operator in the Templo and one in Kids; Sunday at 08:00 has no Kids. */
const PROJECAO_TWO_PLACEMENTS = [
  { role: 'Operador de Projeção', sector: 'Templo', peopleNeeded: 1 },
  { role: 'Operador de Projeção', sector: 'Kids', peopleNeeded: 1 },
] as const;

/** Igreja Semente's gatherings, in America/Sao_Paulo. */
export const IGREJA_SEMENTE_GATHERINGS: GatheringsBlueprint = {
  templates: [
    {
      name: 'Culto de Domingo',
      weekday: 0,
      blocks: [
        {
          key: 'sunday-08:00',
          label: 'Culto 08:00',
          startTime: '08:00',
          endTime: '09:30',
        },
        {
          key: 'sunday-10:30',
          label: 'Culto 10:30',
          startTime: '10:30',
          endTime: '12:30',
        },
        {
          key: 'sunday-18:30',
          label: 'Culto 18:30',
          startTime: '18:30',
          endTime: '20:30',
        },
      ],
    },
    {
      name: 'Culto de Quarta',
      weekday: 3,
      blocks: [
        {
          key: 'wednesday-20:00',
          label: 'Culto 20:00',
          startTime: '20:00',
          endTime: '22:00',
        },
      ],
    },
  ],
  servingRules: [
    serveGatherings({
      ministry: PROJECAO,
      blocks: {
        'sunday-08:00': [
          { role: 'Operador de Projeção', sector: 'Templo', peopleNeeded: 1 },
        ],
        'sunday-10:30': PROJECAO_TWO_PLACEMENTS,
        'sunday-18:30': PROJECAO_TWO_PLACEMENTS,
        'wednesday-20:00': PROJECAO_TWO_PLACEMENTS,
      },
    }),
    serveGatherings({
      ministry: KIDS,
      blocks: {
        'sunday-08:00': null,
        'sunday-10:30': KIDS_BLOCK,
        'sunday-18:30': KIDS_BLOCK,
        'wednesday-20:00': KIDS_BLOCK,
      },
    }),
    serveGatherings({
      ministry: INTERCESSAO,
      blocks: {
        'sunday-08:00': [
          { role: 'Intercessor', sector: 'Sala de Oração', peopleNeeded: 8 },
        ],
        'sunday-10:30': [
          { role: 'Intercessor', sector: 'Sala de Oração', peopleNeeded: 8 },
        ],
        'sunday-18:30': [
          { role: 'Intercessor', sector: 'Sala de Oração', peopleNeeded: 8 },
        ],
        'wednesday-20:00': [
          { role: 'Intercessor', sector: 'Sala de Oração', peopleNeeded: 8 },
        ],
      },
    }),
    serveGatherings({
      ministry: ESTACIONAMENTO,
      blocks: {
        'sunday-08:00': [
          {
            role: 'Orientador de Estacionamento',
            sector: 'Pátio',
            peopleNeeded: 4,
          },
        ],
        'sunday-10:30': [
          {
            role: 'Orientador de Estacionamento',
            sector: 'Pátio',
            peopleNeeded: 4,
          },
        ],
        'sunday-18:30': [
          {
            role: 'Orientador de Estacionamento',
            sector: 'Pátio',
            peopleNeeded: 4,
          },
        ],
        'wednesday-20:00': [
          {
            role: 'Orientador de Estacionamento',
            sector: 'Pátio',
            peopleNeeded: 4,
          },
        ],
      },
    }),
  ],
  dynamicEvents: [
    {
      title: 'Encontro Teens',
      weekday: 6,
      occurrence: 4,
      label: 'Encontro Teens',
      startTime: '19:00',
      endTime: '21:00',
      participations: [
        participate({
          ministry: PROJECAO,
          needs: [
            { role: 'Operador de Projeção', sector: 'Templo', peopleNeeded: 1 },
          ],
        }),
      ],
    },
  ],
};

import { ESTACIONAMENTO } from './directory/estacionamento';
import { INTERCESSAO } from './directory/intercessao';
import { KIDS } from './directory/kids';
import { PROJECAO } from './directory/projecao';
import type { MinistryBlueprint } from './directory/types';
import type { GatheringBlockKey } from './gatherings';

/** One regular gathering of the historical month: its `week`-th weekday. */
export interface GatheringRef {
  block: GatheringBlockKey;
  week: 1 | 2 | 3 | 4;
}

/** One Ministry's post at one gathering. */
export interface ServicePost<
  TRole extends string = string,
  TTeam extends string = string,
> {
  ministry: MinistryBlueprint<TRole, TTeam>;
  role: TRole;
  team?: TTeam;
  gathering: GatheringRef;
}

export function post<TRole extends string, TTeam extends string>(
  servicePost: ServicePost<TRole, TTeam>,
): ServicePost {
  return servicePost;
}

/** Marks every Shift of `ministry` at these gatherings, as "whole day" does. */
export interface UnavailabilityIncident {
  email: string;
  ministry: MinistryBlueprint;
  gatherings: readonly GatheringRef[];
}

/** Assigned, then declined; a replacement serves the post instead. */
export interface DeclineIncident {
  email: string;
  post: ServicePost;
  reason: string;
  replacementEmail: string;
}

/**
 * A cross-Ministry Volunteer two Ministries rostered at the same gathering.
 * The `withdrawn` Ministry's leader cancelled its Assignment and filled the
 * post with `replacementEmail`; the person serves `kept`. Nothing overlaps
 * once resolved.
 */
export interface ResolvedOverlapIncident {
  email: string;
  kept: ServicePost;
  withdrawn: ServicePost;
  reason: string;
  replacementEmail: string;
}

/** A Volunteer who serves two Ministries in the month, at different times. */
export interface CrossMinistryServiceIncident {
  email: string;
  posts: readonly ServicePost[];
}

/** A post published below full: `missing` places stayed open. */
export interface Shortfall {
  post: ServicePost;
  missing: number;
}

/**
 * The trail the locked historical PlanningCycle carries on top of its
 * otherwise fully staffed, published roster. Every other Assignment is filled
 * by rotation through each post's qualified Volunteers.
 */
export interface HistoryBlueprint {
  unavailability: readonly UnavailabilityIncident[];
  declines: readonly DeclineIncident[];
  resolvedOverlaps: readonly ResolvedOverlapIncident[];
  crossMinistryService: readonly CrossMinistryServiceIncident[];
  shortfalls: readonly Shortfall[];
}

export const IGREJA_SEMENTE_HISTORY: HistoryBlueprint = {
  unavailability: [
    {
      email: 'rafael.moura@igreja-semente.test',
      ministry: KIDS,
      gatherings: [
        { block: 'sunday-10:30', week: 2 },
        { block: 'sunday-18:30', week: 2 },
      ],
    },
  ],
  declines: [
    {
      email: 'isabela.medeiros@igreja-semente.test',
      post: post({
        ministry: INTERCESSAO,
        role: 'Intercessor',
        gathering: { block: 'wednesday-20:00', week: 3 },
      }),
      reason: 'Viagem a trabalho',
      replacementEmail: 'vanessa.campos@igreja-semente.test',
    },
  ],
  resolvedOverlaps: [
    {
      email: 'joao.pereira@igreja-semente.test',
      kept: post({
        ministry: INTERCESSAO,
        role: 'Intercessor',
        gathering: { block: 'wednesday-20:00', week: 2 },
      }),
      withdrawn: post({
        ministry: PROJECAO,
        role: 'Operador de Projeção',
        gathering: { block: 'wednesday-20:00', week: 2 },
      }),
      reason: 'Já escalado na Intercessão neste culto',
      replacementEmail: 'daniel.moreira@igreja-semente.test',
    },
  ],
  crossMinistryService: [
    {
      email: 'bruno.dias@igreja-semente.test',
      posts: [
        post({
          ministry: PROJECAO,
          role: 'Operador de Projeção',
          gathering: { block: 'sunday-10:30', week: 1 },
        }),
        post({
          ministry: KIDS,
          role: 'Auxiliar',
          team: 'Maternal',
          gathering: { block: 'sunday-18:30', week: 1 },
        }),
      ],
    },
  ],
  shortfalls: [
    {
      post: post({
        ministry: ESTACIONAMENTO,
        role: 'Orientador de Estacionamento',
        gathering: { block: 'wednesday-20:00', week: 4 },
      }),
      missing: 1,
    },
  ],
};

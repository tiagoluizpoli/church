import { CROSS_MINISTRY } from './directory/cross-ministry';
import { ESTACIONAMENTO } from './directory/estacionamento';
import { INTERCESSAO } from './directory/intercessao';
import { KIDS } from './directory/kids';
import { PROJECAO } from './directory/projecao';
import {
  IGREJA_COLHEITA,
  MULTI_CHURCH_MEMBERSHIPS,
} from './directory/second-church';
import type {
  ChurchDirectoryBlueprint,
  KeyPersona,
  MultiChurchMembershipGroup,
} from './directory/types';
import {
  type GatheringsBlueprint,
  IGREJA_SEMENTE_GATHERINGS,
} from './gatherings';
import { type HistoryBlueprint, IGREJA_SEMENTE_HISTORY } from './history';

/**
 * The fictional Igreja Semente in full: every Ministry roster, its
 * cross-Ministry service and its ChurchAdmin. The rosters under `directory/`
 * are the readable source of truth for every seeded sign-in; all of them use
 * `SEED_PERSONA_PASSWORD`.
 */
export const IGREJA_SEMENTE: ChurchDirectoryBlueprint = {
  church: {
    name: 'Igreja Semente',
    slug: 'igreja-semente',
    timezone: 'America/Sao_Paulo',
  },
  churchAdmin: {
    name: 'Helena Duarte',
    email: 'helena.duarte@igreja-semente.test',
  },
  ministries: [PROJECAO, KIDS, INTERCESSAO, ESTACIONAMENTO],
  crossMinistry: CROSS_MINISTRY,
};

export interface DevelopmentBlueprint {
  primary: ChurchDirectoryBlueprint;
  second: ChurchDirectoryBlueprint;
  /** Both Churches, for checks that span the whole scenario. */
  churches: readonly ChurchDirectoryBlueprint[];
  multiChurchMemberships: readonly MultiChurchMembershipGroup[];
  keyPersonas: readonly KeyPersona[];
  /** The primary Church's gatherings; the second Church plans nothing. */
  gatherings: GatheringsBlueprint;
  /** The trail its locked historical PlanningCycle carries. */
  history: HistoryBlueprint;
}

/** The scenario `db:reseed:dev` loads. */
export const DEVELOPMENT_BLUEPRINT: DevelopmentBlueprint = {
  primary: IGREJA_SEMENTE,
  second: IGREJA_COLHEITA,
  churches: [IGREJA_SEMENTE, IGREJA_COLHEITA],
  multiChurchMemberships: MULTI_CHURCH_MEMBERSHIPS,
  gatherings: IGREJA_SEMENTE_GATHERINGS,
  history: IGREJA_SEMENTE_HISTORY,
  keyPersonas: [
    { label: 'ChurchAdmin', email: 'helena.duarte@igreja-semente.test' },
    { label: 'Kids leader', email: 'natalia.viana@igreja-semente.test' },
    { label: 'Kids leader', email: 'otavio.guimaraes@igreja-semente.test' },
    { label: 'Kids TeamLeader', email: 'patricia.cardoso@igreja-semente.test' },
    {
      label: 'Maternal TeamLeader',
      email: 'heloisa.rezende@igreja-semente.test',
    },
    { label: 'Volunteer', email: 'rafael.moura@igreja-semente.test' },
    {
      label: 'Projeção + Maternal',
      email: 'bruno.dias@igreja-semente.test',
    },
    {
      label: 'Colheita ChurchAdmin',
      email: 'priscila.almeida@igreja-colheita.test',
    },
    {
      label: 'Two Churches',
      email: 'vitoria.ribeiro@igreja-colheita.test',
    },
  ],
};

/** The Church Timezone the development reseed anchor defaults in: the
 * primary development Church's own. */
export const DEVELOPMENT_CHURCH_TIMEZONE = IGREJA_SEMENTE.church.timezone;

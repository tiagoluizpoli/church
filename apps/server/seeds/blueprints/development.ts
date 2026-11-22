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

/** A wordless seed-and-sprout mark, wider than tall, for the seeded logo. */
const IGREJA_SEMENTE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <ellipse cx="320" cy="230" rx="150" ry="60" fill="#0f766e"/>
  <path d="M320 200 C320 140 320 110 320 80" stroke="#115e59" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M320 120 C260 120 220 90 210 40 C270 40 310 70 320 120 Z" fill="#14b8a6"/>
  <path d="M320 100 C380 100 420 70 430 20 C370 20 330 50 320 100 Z" fill="#2dd4bf"/>
</svg>`;

/**
 * The fictional Igreja Semente in full: every Ministry schedule, its
 * cross-Ministry service and its ChurchAdmin. The schedules under `directory/`
 * are the readable source of truth for every seeded sign-in; all of them use
 * `SEED_PERSONA_PASSWORD`.
 */
export const IGREJA_SEMENTE: ChurchDirectoryBlueprint = {
  church: {
    name: 'Igreja Semente',
    slug: 'igreja-semente',
    timezone: 'America/Sao_Paulo',
    website: 'https://igreja-semente.test',
    accentColor: '#0f766e',
    contacts: [
      {
        kind: 'phone',
        phoneType: 'mobile',
        value: '+5511987654321',
        description: 'Secretaria',
        isWhatsApp: true,
        isPublic: true,
      },
      {
        kind: 'email',
        phoneType: null,
        value: 'contato@igreja-semente.test',
        description: null,
        isWhatsApp: false,
        isPublic: true,
      },
      {
        kind: 'phone',
        phoneType: 'landline',
        value: '+551134567890',
        description: 'Pastor (só admins)',
        isWhatsApp: false,
        isPublic: false,
      },
    ],
    logoSvg: IGREJA_SEMENTE_LOGO_SVG,
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
  /** The trail its sent historical Cycle carries. */
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
    { label: 'Kids Líder', email: 'patricia.cardoso@igreja-semente.test' },
    {
      label: 'Maternal Líder',
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

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
    previousSlugs: ['semente-de-campinas'],
    addresses: [
      {
        label: 'Templo',
        street: 'Avenida Francisco Glicério',
        number: '1250',
        bairro: 'Centro',
        city: 'Campinas',
        uf: 'SP',
        cep: '13012-100',
        pin: { latitude: -22.9057, longitude: -47.0608, source: 'admin' },
      },
      {
        label: 'Salão anexo',
        street: 'Rua Barão de Jaguara',
        number: 's/n',
        complement: 'Ao lado da padaria',
        bairro: 'Cambuí',
        city: 'Campinas',
        uf: 'SP',
      },
      {
        label: 'Célula na casa do Marcos',
        street: 'Rua das Acácias',
        number: '88',
        bairro: 'Jardim Chapadão',
        city: 'Campinas',
        uf: 'SP',
        isPublic: false,
      },
    ],
    contactGroups: ['Pastora Helena', 'Louvor'],
    contacts: [
      {
        kind: 'phone',
        phoneType: 'mobile',
        value: '+5511987654321',
        description: 'Secretaria',
        isWhatsApp: true,
        isPublic: true,
        group: null,
      },
      {
        kind: 'email',
        phoneType: null,
        value: 'contato@igreja-semente.test',
        description: null,
        isWhatsApp: false,
        isPublic: true,
        group: null,
      },
      {
        kind: 'phone',
        phoneType: 'landline',
        value: '+551134567890',
        description: 'Pastor (só admins)',
        isWhatsApp: false,
        isPublic: false,
        group: 'Pastora Helena',
      },
      {
        kind: 'email',
        phoneType: null,
        value: 'louvor@igreja-semente.test',
        description: 'Escalas do louvor',
        isWhatsApp: false,
        isPublic: true,
        group: 'Louvor',
      },
    ],
    socialLinks: [
      { url: 'https://instagram.com/igrejasemente' },
      {
        url: 'https://youtube.com/@igrejasemente',
        description: 'Cultos ao vivo',
      },
      {
        url: 'https://youtube.com/@pastorhelena',
        description: 'Canal da pastora',
        group: 'Pastora Helena',
      },
      { url: 'https://facebook.com/igrejasemente' },
      { url: 'https://t.me/igrejasemente' },
      {
        url: 'https://whatsapp.com/channel/0029VaSemente',
        description: 'Avisos da semana',
      },
      {
        url: 'https://instagram.com/louvorsemente',
        description: 'Ensaios e bastidores',
        group: 'Louvor',
      },
      { url: 'https://open.spotify.com/show/semente', description: 'Podcast' },
    ],
    legalProfile: {
      legalName: 'Igreja Semente de Campinas',
      cnpj: '11222333000181',
      isPublic: true,
    },
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

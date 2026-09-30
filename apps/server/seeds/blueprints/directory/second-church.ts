import {
  type ChurchDirectoryBlueprint,
  defineMinistry,
  type MultiChurchMembershipGroup,
} from './types';

/**
 * A small second Church for Church switching and tenant-isolation checks. Its
 * Ministry deliberately reuses the primary Church's names, so a leak shows up
 * as foreign people rather than a foreign label.
 */
export const IGREJA_COLHEITA: ChurchDirectoryBlueprint = {
  church: {
    name: 'Igreja Colheita',
    slug: 'igreja-colheita',
    timezone: 'America/Sao_Paulo',
  },
  churchAdmin: {
    name: 'Priscila Almeida',
    email: 'priscila.almeida@igreja-colheita.test',
  },
  ministries: [
    defineMinistry({
      name: 'Kids',
      roles: ['Líder', 'Auxiliar'],
      teams: ['Kids'],
      roster: [
        {
          seat: {
            ministryLeader: true,
            roles: ['Líder', 'Auxiliar'],
            teams: [{ team: 'Kids', teamLeader: true }],
          },
          people: [
            {
              name: 'Rodrigo Dias',
              email: 'rodrigo.dias@igreja-colheita.test',
            },
          ],
        },
        {
          seat: { roles: ['Auxiliar'], teams: [{ team: 'Kids' }] },
          people: [
            {
              name: 'Simone Lopes',
              email: 'simone.lopes@igreja-colheita.test',
            },
            {
              name: 'Túlio Moreira',
              email: 'tulio.moreira@igreja-colheita.test',
            },
            {
              name: 'Vitória Ribeiro',
              email: 'vitoria.ribeiro@igreja-colheita.test',
            },
          ],
        },
      ],
    }),
  ],
  crossMinistry: [],
};

/**
 * Users who belong to both Churches. Each stays an active Volunteer only in
 * the Church whose roster declares them; the other Church sees a plain member.
 */
export const MULTI_CHURCH_MEMBERSHIPS: readonly MultiChurchMembershipGroup[] = [
  {
    churchSlug: IGREJA_COLHEITA.church.slug,
    emails: [
      'helena.duarte@igreja-semente.test', // Igreja Semente's ChurchAdmin
      'natalia.viana@igreja-semente.test', // Kids Ministry leader
      'mateus.rocha@igreja-semente.test', // Projeção Operador
    ],
  },
  {
    churchSlug: 'igreja-semente',
    emails: ['vitoria.ribeiro@igreja-colheita.test'],
  },
];

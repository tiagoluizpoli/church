/**
 * The smallest complete Church graph: one provisioned Church, its redeemed
 * ChurchAdmin, and one Volunteer seated in a Ministry, a Team and a Role. Every
 * identity is fictional and every identifier fixed, so the graph is the same
 * each time it is loaded.
 */
export const MINIMAL_CHURCH_BLUEPRINT = {
  church: {
    id: '5eed0000-0000-4000-8000-000000000001',
    name: 'Igreja Semente',
    slug: 'igreja-semente',
    timezone: 'America/Sao_Paulo',
    adminInvitationId: '5eed0000-0000-4000-8000-000000000401',
  },
  ministry: {
    id: '5eed0000-0000-4000-8000-000000000101',
    name: 'Kids',
    team: { id: '5eed0000-0000-4000-8000-000000000201', name: 'Maternal' },
    role: { id: '5eed0000-0000-4000-8000-000000000301', name: 'Auxiliar' },
  },
  personas: {
    churchAdmin: {
      userId: '5eed0000-0000-4000-8000-000000001001',
      name: 'Helena Duarte',
      email: 'helena.duarte@igreja-semente.test',
      churchMembershipId: '5eed0000-0000-4000-8000-000000004001',
    },
    volunteer: {
      userId: '5eed0000-0000-4000-8000-000000001002',
      name: 'Rafael Moura',
      email: 'rafael.moura@igreja-semente.test',
      churchMembershipId: '5eed0000-0000-4000-8000-000000004002',
      volunteerId: '5eed0000-0000-4000-8000-000000002002',
      ministryMembershipId: '5eed0000-0000-4000-8000-000000003002',
    },
  },
} as const;

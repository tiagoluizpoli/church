export interface SchedulingChurchFixture {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface SchedulingMinistryFixture {
  id: string;
  churchId: string;
  name: string;
}

export type SchedulingRoleFixture =
  | { scope: 'church'; role: 'church_admin' }
  | { scope: 'ministry'; role: 'leader'; ministryId: string };

export interface SchedulingActorFixture {
  userId: string;
  volunteerId: string;
  churchId: string;
  roles: SchedulingRoleFixture[];
}

export interface SchedulingFixtures {
  churchA: SchedulingChurchFixture;
  churchB: SchedulingChurchFixture;
  ministryA: SchedulingMinistryFixture;
  adminLeader: SchedulingActorFixture;
}

export function createSchedulingFixtures(): SchedulingFixtures {
  const churchA = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Scheduling Church A',
    slug: 'scheduling-church-a',
    timezone: 'America/Sao_Paulo',
  };
  const churchB = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Scheduling Church B',
    slug: 'scheduling-church-b',
    timezone: 'America/New_York',
  };
  const ministryA = {
    id: '33333333-3333-4333-8333-333333333333',
    churchId: churchA.id,
    name: 'Scheduling Ministry A',
  };

  return {
    churchA,
    churchB,
    ministryA,
    adminLeader: {
      userId: 'scheduling-admin-leader',
      volunteerId: '44444444-4444-4444-8444-444444444444',
      churchId: churchA.id,
      roles: [
        { scope: 'church', role: 'church_admin' },
        { scope: 'ministry', role: 'leader', ministryId: ministryA.id },
      ],
    },
  };
}

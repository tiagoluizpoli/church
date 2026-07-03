import { describe, expect, it } from 'vitest';
import { createSchedulingFixtures } from '../../src/test-support/scheduling-fixtures';

describe('createSchedulingFixtures', () => {
  it('creates two isolated churches', () => {
    const fixtures = createSchedulingFixtures();

    expect(fixtures.churchA.id).not.toBe(fixtures.churchB.id);
    expect(fixtures.churchA.slug).not.toBe(fixtures.churchB.slug);
  });

  it('gives one user church-admin and ministry-leader roles', () => {
    const fixtures = createSchedulingFixtures();

    expect(fixtures.adminLeader.churchId).toBe(fixtures.churchA.id);
    expect(fixtures.adminLeader.roles).toEqual([
      { scope: 'church', role: 'church_admin' },
      {
        scope: 'ministry',
        role: 'leader',
        ministryId: fixtures.ministryA.id,
      },
    ]);
  });
});

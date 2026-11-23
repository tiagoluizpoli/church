import { churchContactGroup } from '@church/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { isUniqueViolation } from '@/infrastructure/repositories/unique-violation';
import { buildChurch } from '@/seeds/builders/church';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const CHURCH_B = '22222222-2222-4222-8222-222222222222';

beforeEach(async () => {
  await truncateAll();
  for (const [id, slug] of [
    [CHURCH_A, 'igreja-a'],
    [CHURCH_B, 'igreja-b'],
  ] as const) {
    await buildChurch({
      db,
      id,
      name: slug,
      slug,
      timezone: 'America/Sao_Paulo',
    });
  }
});

describe('Contact Group names in the database', () => {
  it('holds one group per name and Church, case-insensitively, so racing saves cannot duplicate one', async () => {
    await db
      .insert(churchContactGroup)
      .values({ churchId: CHURCH_A, name: 'Louvor', position: 0 });

    const error = await db
      .insert(churchContactGroup)
      .values({ churchId: CHURCH_A, name: 'LOUVOR', position: 1 })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(
      isUniqueViolation({
        error,
        constraint: 'church_contact_group_church_name_idx',
      }),
    ).toBe(true);
    await db
      .insert(churchContactGroup)
      .values({ churchId: CHURCH_B, name: 'Louvor', position: 0 });
  });
});

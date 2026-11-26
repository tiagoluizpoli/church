import { churchSlugHistory, organization } from '@church/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChurchId } from '@/domain/branded-ids';
import { DrizzleChurchRepository } from '@/infrastructure/repositories/drizzle-church.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { isUniqueViolation } from '@/infrastructure/repositories/unique-violation';
import { buildChurch } from '@/seeds/builders/church';
import {
  testDb as db,
  truncateAll,
} from '@/tests/integration/repositories/setup';

/**
 * #1016: a slug a Church gave up stays reserved to it, unique across
 * Churches together with live slugs. The database holds that rule, so a
 * writer that skips the availability check (provisioning, a racing save)
 * cannot break it either.
 */

const CHURCH_A = '11111111-1111-4111-8111-111111111111';
const CHURCH_B = '22222222-2222-4222-8222-222222222222';
const CLAIM = 'church_slug_claim';
const RACE_SETTLE_MS = 200;

const isClaimViolation = (error: unknown) =>
  isUniqueViolation({ error, constraint: CLAIM });

interface RenameInput {
  churchId: string;
  slug: string;
}

/** A raw live-slug write, as provisioning or any writer without the check does it. */
const setLiveSlug = ({ churchId, slug }: RenameInput) =>
  db.update(organization).set({ slug }).where(eq(organization.id, churchId));

beforeEach(async () => {
  await truncateAll();
  await buildChurch({
    db,
    id: CHURCH_A,
    name: 'Igreja A',
    slug: 'igreja-a',
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: CHURCH_B,
    name: 'Igreja B',
    slug: 'igreja-b',
    timezone: 'America/Sao_Paulo',
  });
});

describe('Church Slug claims in the database', () => {
  it("refuses a live slug that is in another Church's history", async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'antiga-a', churchId: CHURCH_A });

    const error = await setLiveSlug({ churchId: CHURCH_B, slug: 'antiga-a' })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(isClaimViolation(error)).toBe(true);
  });

  it("refuses a history entry for another Church's live slug", async () => {
    const error = await db
      .insert(churchSlugHistory)
      .values({ slug: 'igreja-b', churchId: CHURCH_A })
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(isClaimViolation(error)).toBe(true);
  });

  it('lets a Church take back a slug from its own history', async () => {
    await db
      .insert(churchSlugHistory)
      .values({ slug: 'antiga-a', churchId: CHURCH_A });

    await setLiveSlug({ churchId: CHURCH_A, slug: 'antiga-a' });

    const [row] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, CHURCH_A));
    expect(row?.slug).toBe('antiga-a');
  });

  it('refuses a slug claimed while its holder is giving it up', async () => {
    const repository = new DrizzleChurchRepository({ db });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let givenUp!: () => void;
    const written = new Promise<void>((resolve) => {
      givenUp = resolve;
    });
    // Church A moves to a new slug and holds its transaction open.
    const giveUp = new DrizzleUnitOfWork({ db }).run(async (tx) => {
      await repository.saveSettings({
        id: ChurchId.from(CHURCH_A),
        changes: {
          name: 'Igreja A',
          slug: 'igreja-a-nova',
          website: null,
          accentColor: null,
          addresses: [],
          socialLinks: [],
          contacts: [],
          contactGroups: [],
          legalProfile: null,
        },
        tx,
      });
      givenUp();
      await held;
    });
    await written;
    // Church B claims the old slug: it waits on A's row, then sees A's history.
    const claim = setLiveSlug({ churchId: CHURCH_B, slug: 'igreja-a' })
      .then(() => null)
      .catch((caught: unknown) => caught);
    await new Promise((resolve) => setTimeout(resolve, RACE_SETTLE_MS));
    release();
    await giveUp;

    expect(isClaimViolation(await claim)).toBe(true);
    const [b] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, CHURCH_B));
    expect(b?.slug).toBe('igreja-b');
  });
});

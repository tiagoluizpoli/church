import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { church } from '../../src/schema/church';
import { organization } from '../../src/schema/organization';
import { createChurch } from '../../src/tenancy';
import { clearDatabase, testDb } from './setup';

describe('Church Schema', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('keys the church extension row by its organization id', async () => {
    const created = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-church',
    });

    const [organizationRow] = await testDb
      .select()
      .from(organization)
      .where(eq(organization.id, created.id));
    const [churchRow] = await testDb
      .select()
      .from(church)
      .where(eq(church.id, created.id));

    expect(organizationRow?.name).toBe('Test Church');
    expect(organizationRow?.slug).toBe('test-church');
    expect(churchRow?.id).toBe(created.id);
    expect(churchRow?.timezone).toBe('UTC');
  });

  it('holds neither name nor slug on the extension row', async () => {
    const created = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-church',
    });

    const [churchRow] = await testDb
      .select()
      .from(church)
      .where(eq(church.id, created.id));

    expect(churchRow).not.toHaveProperty('name');
    expect(churchRow).not.toHaveProperty('slug');
  });

  it('rejects an extension row with no organization behind it', async () => {
    await expect(
      testDb.insert(church).values({ id: crypto.randomUUID() }),
    ).rejects.toThrow();
  });

  it('enforces a unique slug on the organization', async () => {
    await createChurch({ db: testDb, name: 'Church 1', slug: 'common-slug' });

    await expect(
      createChurch({ db: testDb, name: 'Church 2', slug: 'common-slug' }),
    ).rejects.toThrow();
  });

  it('drops the extension row when its organization goes', async () => {
    const created = await createChurch({
      db: testDb,
      name: 'Test Church',
      slug: 'test-church',
    });

    await testDb.delete(organization).where(eq(organization.id, created.id));

    const remaining = await testDb
      .select()
      .from(church)
      .where(eq(church.id, created.id));
    expect(remaining).toHaveLength(0);
  });
});

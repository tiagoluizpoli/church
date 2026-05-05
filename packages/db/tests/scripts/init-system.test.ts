import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/schema';
import { runInitSystem } from '../../src/scripts/init-system';
import { clearDatabase, testDb } from '../schema/setup';

describe('runInitSystem', () => {
  const seedPath = join(__dirname, 'test-seed.json');

  beforeEach(async () => {
    await clearDatabase();
    // Create a dummy user
    await testDb.insert(schema.user).values({
      id: 'admin-id',
      email: 'admin@test.com',
      name: 'Admin User',
      emailVerified: true,
    });
  });

  afterEach(() => {
    try {
      unlinkSync(seedPath);
    } catch {}
  });

  it('BT-001: Happy Path - valid initialization', async () => {
    const seedData = {
      churchName: 'Test Church',
      churchSlug: 'test-church',
      adminEmail: 'admin@test.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    const result = await runInitSystem(seedPath);

    expect(result.church?.slug).toBe('test-church');
    expect(result.user?.email).toBe('admin@test.com');
    expect(result.volunteer?.status).toBe('active');
    expect(result.ministry?.name).toBe('Administration');

    // Verify in DB
    const churches = await testDb.select().from(schema.church);
    expect(churches).toHaveLength(1);
    expect(churches[0]?.slug).toBe('test-church');

    const links = await testDb.select().from(schema.ministryVolunteer);
    expect(links).toHaveLength(1);
    expect(links[0]?.systemRole).toBe('leader');
  });

  it('BT-004: Edge - malformed JSON validation', async () => {
    writeFileSync(seedPath, '{ invalid json }');
    await expect(runInitSystem(seedPath)).rejects.toThrow();
  });

  it('BT-005: Happy Path - auto-create admin user if missing', async () => {
    const seedData = {
      churchName: 'Test Church',
      churchSlug: 'test-church',
      adminEmail: 'new-admin@test.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    const result = await runInitSystem(seedPath);
    expect(result.user?.email).toBe('new-admin@test.com');

    const users = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'new-admin@test.com'));
    expect(users).toHaveLength(1);
  });

  it('BT-006: Edge - church slug already exists (Idempotency)', async () => {
    // Pre-create church
    await testDb.insert(schema.church).values({
      name: 'Existing Church',
      slug: 'test-church',
    });

    const seedData = {
      churchName: 'Test Church',
      churchSlug: 'test-church',
      adminEmail: 'admin@test.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    const result = await runInitSystem(seedPath);
    expect(result.church?.name).toBe('Existing Church'); // Should reuse existing

    const churches = await testDb.select().from(schema.church);
    expect(churches).toHaveLength(1);
  });

  it('BT-008: Catastrophic - rollback on failure', async () => {
    // Scenario: Admin user lookup fails AFTER Church is potentially created
    const seedData = {
      churchName: 'Rollback Church',
      churchSlug: 'a'.repeat(300), // Exceeds varchar(255) limit
      adminEmail: 'admin@rollback.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    // Should throw error
    await expect(runInitSystem(seedPath)).rejects.toThrow();

    // Verify Church was NOT created (rollback worked)
    const churches = await testDb
      .select()
      .from(schema.church)
      .where(eq(schema.church.slug, 'rollback-church'));
    expect(churches).toHaveLength(0);
  });
});

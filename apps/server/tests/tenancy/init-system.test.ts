import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as schema from '@church/db';
import { createChurch } from '@church/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInitSystem } from '../../src/scripts/init-system';
import { testDb, truncateAll } from '../integration/repositories/setup';

describe('runInitSystem', () => {
  const seedPath = join(__dirname, 'test-seed.json');

  beforeEach(async () => {
    await truncateAll();
    // Dummy user pre-seeded so BT-001 exercises the "user already exists"
    // branch, distinct from BT-005's "auto-create" branch.
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

    const result = await runInitSystem({ seedPath });

    expect(result.church?.slug).toBe('test-church');
    expect(result.user?.email).toBe('admin@test.com');
    expect(result.volunteer?.status).toBe('active');
    expect(result.ministry?.name).toBe('Administration');

    // Verify in DB
    const churches = await testDb.select().from(schema.church);
    expect(churches).toHaveLength(1);
    const organizations = await testDb.select().from(schema.organization);
    expect(organizations).toHaveLength(1);
    expect(organizations[0]?.slug).toBe('test-church');
    expect(organizations[0]?.id).toBe(churches[0]?.id);

    // Church Membership, not just a Volunteer profile.
    const members = await testDb.select().from(schema.member);
    expect(members).toHaveLength(1);
    expect(members[0]?.organizationId).toBe(organizations[0]?.id);
    expect(members[0]?.role).toBe('admin');

    const links = await testDb.select().from(schema.ministryVolunteer);
    expect(links).toHaveLength(1);
    expect(links[0]?.ministryAccessLevel).toBe('leader');

    // Provisioned through the Platform Operator operation — a Church
    // Invitation for the admin exists alongside the granted membership.
    const invitations = await testDb
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, 'admin@test.com'));
    expect(invitations).toHaveLength(1);
    expect(invitations[0]?.status).toBe('pending');
  });

  it('BT-004: Edge - malformed JSON validation', async () => {
    writeFileSync(seedPath, '{ invalid json }');
    await expect(runInitSystem({ seedPath })).rejects.toThrow();
  });

  it('BT-005: Happy Path - auto-create admin user if missing', async () => {
    const seedData = {
      churchName: 'Test Church',
      churchSlug: 'test-church',
      adminEmail: 'new-admin@test.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    const result = await runInitSystem({ seedPath });
    expect(result.user?.email).toBe('new-admin@test.com');

    const users = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, 'new-admin@test.com'));
    expect(users).toHaveLength(1);
  });

  it('BT-006: Edge - church slug already exists (Idempotency)', async () => {
    // Pre-create church
    await createChurch({
      db: testDb,
      name: 'Existing Church',
      slug: 'test-church',
    });

    const seedData = {
      churchName: 'Test Church',
      churchSlug: 'test-church',
      adminEmail: 'admin@test.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    const result = await runInitSystem({ seedPath });
    expect(result.church?.name).toBe('Existing Church'); // Should reuse existing

    const churches = await testDb.select().from(schema.church);
    expect(churches).toHaveLength(1);

    // Re-running against an existing Church never re-provisions — no
    // Church Invitation is minted for it.
    const invitations = await testDb
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, 'admin@test.com'));
    expect(invitations).toHaveLength(0);
  });

  it('BT-008: Catastrophic - rollback on failure', async () => {
    // Scenario: the Church is created first, then the Volunteer step fails
    // because the admin already holds the one active Volunteer profile a User
    // is allowed — in another Church. The whole transaction must unwind.
    const otherChurch = await createChurch({
      db: testDb,
      name: 'Other Church',
      slug: 'other-church',
    });
    await testDb.insert(schema.user).values({
      id: 'rollback-admin-id',
      email: 'admin@rollback.com',
      name: 'Rollback Admin',
      emailVerified: true,
    });
    await testDb.insert(schema.volunteer).values({
      userId: 'rollback-admin-id',
      churchId: otherChurch.id,
      status: 'active',
    });

    const seedData = {
      churchName: 'Rollback Church',
      churchSlug: 'rollback-church',
      adminEmail: 'admin@rollback.com',
    };
    writeFileSync(seedPath, JSON.stringify(seedData));

    // Should throw error
    await expect(runInitSystem({ seedPath })).rejects.toThrow();

    // Verify Church was NOT created (rollback worked)
    const organizations = await testDb
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.slug, 'rollback-church'));
    expect(organizations).toHaveLength(0);

    const churches = await testDb.select().from(schema.church);
    expect(churches.map((row) => row.id)).toEqual([otherChurch.id]);

    // The provisioning half rolled back too — no stray invitation left behind.
    const invitations = await testDb
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, 'admin@rollback.com'));
    expect(invitations).toHaveLength(0);
  });
});

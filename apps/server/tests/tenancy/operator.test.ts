import { invitation, organization, user } from '@church/db';
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLATFORM_OPERATOR_EMAIL } from '@/scripts/ensure-platform-operator';
import { runOperatorCommand } from '@/scripts/operator';
import { testDb, truncateAll } from '@/tests/integration/repositories/setup';

const PROVISION = [
  'provision-church',
  '--environment',
  'staging',
  '--name',
  'First Church',
  '--slug',
  'first-church',
  '--admin-email',
  'admin@first-church.test',
];

interface RunInput {
  argv: string[];
  runtimeEnvironment?: string;
}

function run({ argv, runtimeEnvironment = 'staging' }: RunInput) {
  return runOperatorCommand({ db: testDb, argv, runtimeEnvironment });
}

async function countRows() {
  const [users] = await testDb.select({ value: count() }).from(user);
  const [churches] = await testDb.select({ value: count() }).from(organization);
  return { users: users?.value, churches: churches?.value };
}

describe('operator commands', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('sets up the Platform Operator identity once, without demo users', async () => {
    await run({ argv: ['setup-identity', '--environment', 'staging'] });
    await run({ argv: ['setup-identity', '--environment', 'staging'] });

    const rows = await testDb.select().from(user);
    expect(rows.map((row) => row.email)).toEqual([PLATFORM_OPERATOR_EMAIL]);
  });

  it('provisions a Church with a pending first ChurchAdmin invitation', async () => {
    await run({ argv: ['setup-identity', '--environment', 'staging'] });

    const result = await run({ argv: PROVISION });

    const [row] = await testDb
      .select()
      .from(invitation)
      .where(eq(invitation.id, result?.invitationId ?? ''));
    expect(row).toMatchObject({
      email: 'admin@first-church.test',
      role: 'admin',
      status: 'pending',
    });
  });

  it('refuses to provision before the identity is set up', async () => {
    await expect(run({ argv: PROVISION })).rejects.toThrow(/setup-identity/);
    expect(await countRows()).toEqual({ users: 0, churches: 0 });
  });

  it.each([
    ['an environment other than the one connected', 'production', 'staging'],
    ['an unknown environment', 'qa', 'qa'],
    ['local', 'local', 'local'],
  ])('refuses %s before writing', async (_label, requested, runtime) => {
    await expect(
      run({
        argv: ['setup-identity', '--environment', requested],
        runtimeEnvironment: runtime,
      }),
    ).rejects.toThrow(/Refusing target/);
    expect(await countRows()).toEqual({ users: 0, churches: 0 });
  });

  it('refuses a missing target or required input before writing', async () => {
    await expect(run({ argv: ['setup-identity'] })).rejects.toThrow(
      /--environment/,
    );
    await run({ argv: ['setup-identity', '--environment', 'staging'] });
    await expect(
      run({ argv: ['provision-church', '--environment', 'staging'] }),
    ).rejects.toThrow(/--name, --slug, --admin-email/);
    expect(await countRows()).toEqual({ users: 1, churches: 0 });
  });
});

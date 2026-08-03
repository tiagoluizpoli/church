import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '@playwright/test';
import { z } from 'zod';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright global setup: provisions authenticated role sessions and seeded
 * domain data for scheduling E2E specs.
 *
 *  1. Sign up disposable leader, TeamLeader, and volunteer users.
 *  2. Shell out to the SERVER seed script (frontend stays DB-free).
 *  3. Persist admin/leader/volunteer sessions to `tests/.auth/` so specs opt in
 *     `test.use({ storageState })` — existing unauthenticated specs untouched.
 *
 * ChurchAdmin and leader states share one session, proving role coexistence
 * once ChurchAdmin authorization is introduced by the foundational phase.
 */
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const SERVER_DIR = path.resolve(dirname, '../../server');

export const CHURCH_ADMIN_STORAGE_STATE = path.resolve(
  dirname,
  '.auth/church-admin.json',
);
export const LEADER_STORAGE_STATE = path.resolve(dirname, '.auth/leader.json');
export const VOLUNTEER_STORAGE_STATE = path.resolve(
  dirname,
  '.auth/volunteer.json',
);
export const TEAM_LEADER_STORAGE_STATE = path.resolve(
  dirname,
  '.auth/team-leader.json',
);
export const CHURCH_B_ADMIN_STORAGE_STATE = path.resolve(
  dirname,
  '.auth/church-b-admin.json',
);
export const E2E_AUTH_META = path.resolve(dirname, '.auth/e2e-users.json');

const LEADER_BASE = {
  password: 'e2e-Password-123',
  name: 'E2E Leader',
};

const TEAM_LEADER_BASE = {
  password: 'e2e-Password-456',
  name: 'E2E Team Leader',
};

const VOLUNTEER_BASE = {
  password: 'e2e-Password-789',
  name: 'E2E Volunteer',
};

// Distinct tenant's admin, used only by the cross-cutting church-isolation
// spec (DL4-X1) — never referenced by the five per-story specs.
const CHURCH_B_ADMIN_BASE = {
  password: 'e2e-Password-321',
  name: 'E2E ChurchB Admin',
};

const AUTH_RESPONSE_SCHEMA = z.object({
  user: z.object({ id: z.string().min(1) }),
});

export const E2E_AUTH_META_SCHEMA = z.object({
  leaderUserId: z.string().min(1),
  teamLeaderUserId: z.string().min(1),
  volunteerUserId: z.string().min(1),
  churchBAdminUserId: z.string().min(1),
});

interface AuthUserCredentials {
  email: string;
  password: string;
  name: string;
}

function makeUniqueEmail(label: string): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${label}-${suffix}@test.com`;
}

async function authUser(
  ctx: Awaited<ReturnType<typeof request.newContext>>,
  creds: AuthUserCredentials,
): Promise<string> {
  execFileSync(
    'bun',
    [
      '--env-file=../../.env',
      'run',
      'src/scripts/e2e-create-user.ts',
      creds.email,
      creds.name,
      creds.password,
    ],
    { cwd: SERVER_DIR },
  );
  const res = await ctx.post(`${SERVER_URL}/api/auth/sign-in/email`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    throw new Error(
      `Auth failed for ${creds.email} (${res.status()}): ${await res.text()}`,
    );
  }
  return AUTH_RESPONSE_SCHEMA.parse(await res.json()).user.id;
}

import globalTeardown from './global-teardown';

export default async function globalSetup(): Promise<void> {
  // Clean up any stale data from previous aborted runs before seeding.
  globalTeardown();

  const leaderCtx = await request.newContext({ baseURL: SERVER_URL });
  const teamLeaderCtx = await request.newContext({ baseURL: SERVER_URL });
  const volunteerCtx = await request.newContext({ baseURL: SERVER_URL });
  const churchBAdminCtx = await request.newContext({ baseURL: SERVER_URL });
  const leaderCreds = {
    ...LEADER_BASE,
    email: makeUniqueEmail('e2e-leader'),
  };
  const teamLeaderCreds = {
    ...TEAM_LEADER_BASE,
    email: makeUniqueEmail('e2e-teamleader'),
  };
  const volunteerCreds = {
    ...VOLUNTEER_BASE,
    email: makeUniqueEmail('e2e-volunteer'),
  };
  const churchBAdminCreds = {
    ...CHURCH_B_ADMIN_BASE,
    email: makeUniqueEmail('e2e-churchb-admin'),
  };

  const [leaderId, teamLeaderId, volunteerId, churchBAdminId] =
    await Promise.all([
      authUser(leaderCtx, leaderCreds),
      authUser(teamLeaderCtx, teamLeaderCreds),
      authUser(volunteerCtx, volunteerCreds),
      authUser(churchBAdminCtx, churchBAdminCreds),
    ]);

  execFileSync(
    'bun',
    [
      'run',
      'seed:e2e',
      '--',
      `--leader-user-id=${leaderId}`,
      `--team-leader-user-id=${teamLeaderId}`,
      `--volunteer-user-id=${volunteerId}`,
      `--church-b-admin-user-id=${churchBAdminId}`,
    ],
    { cwd: SERVER_DIR, stdio: 'inherit' },
  );

  mkdirSync(path.dirname(E2E_AUTH_META), { recursive: true });
  writeFileSync(
    E2E_AUTH_META,
    JSON.stringify(
      E2E_AUTH_META_SCHEMA.parse({
        leaderUserId: leaderId,
        teamLeaderUserId: teamLeaderId,
        volunteerUserId: volunteerId,
        churchBAdminUserId: churchBAdminId,
      }),
    ),
  );

  await Promise.all([
    leaderCtx.storageState({ path: CHURCH_ADMIN_STORAGE_STATE }),
    leaderCtx.storageState({ path: LEADER_STORAGE_STATE }),
    teamLeaderCtx.storageState({ path: TEAM_LEADER_STORAGE_STATE }),
    volunteerCtx.storageState({ path: VOLUNTEER_STORAGE_STATE }),
    churchBAdminCtx.storageState({ path: CHURCH_B_ADMIN_STORAGE_STATE }),
  ]);

  await Promise.all([
    leaderCtx.dispose(),
    teamLeaderCtx.dispose(),
    volunteerCtx.dispose(),
    churchBAdminCtx.dispose(),
  ]);
}

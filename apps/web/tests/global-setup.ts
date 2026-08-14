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
 *  1. Provision both Churches through the real Church Provisioning operation
 *     (`e2e-provision-church.ts`), each minting a Church Invitation to its
 *     first ChurchAdmin.
 *  2. Redeem every actor's Church Invitation for real (`e2e-redeem-church-
 *     invitation.ts`) — public sign-up is closed, so no user here is ever
 *     created any other way. The ChurchAdmin invites TeamLeader/Volunteer
 *     into Church A as ordinary Church Members before they redeem too
 *     (`e2e-mint-church-invitation.ts`).
 *  3. Shell out to the SERVER seed script for the scheduling domain fixture
 *     (frontend stays DB-free) — Ministry Membership, Roles and Teams are
 *     still written directly, which spec 024 §3.2 permits for fixture setup.
 *  4. Persist admin/leader/volunteer sessions to `tests/.auth/` so specs opt
 *     in `test.use({ storageState })` — existing unauthenticated specs
 *     untouched.
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

// Mirrors `apps/server/src/test-support/e2e-seed.ts`'s `E2E_IDS.church` /
// `E2E_IDS.churchB` — pinned so the domain fixture's hardcoded ids still
// resolve against the Church this setup provisions.
const CHURCH_A_ID = 'e2e11111-1111-1111-1111-111111111111';
const CHURCH_B_ID = 'e2ebbbbb-1111-1111-1111-111111111111';

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

interface AuthUserInput {
  ctx: Awaited<ReturnType<typeof request.newContext>>;
  creds: AuthUserCredentials;
  invitationId: string;
}

interface MakeUniqueEmailInput {
  label: string;
}

function makeUniqueEmail({ label }: MakeUniqueEmailInput): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${label}-${suffix}@test.com`;
}

function runServerScript({
  scriptPath,
  args,
}: {
  scriptPath: string;
  args: string[];
}): string {
  return execFileSync(
    'bun',
    ['--env-file=../../.env', 'run', scriptPath, ...args],
    { cwd: SERVER_DIR },
  ).toString();
}

/** Parses the last non-empty stdout line as JSON — scripts may log incidental lines before it. */
function parseLastJsonLine<T>(output: string): T {
  const lastLine = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!lastLine) {
    throw new Error(`Expected a JSON line on stdout, got:\n${output}`);
  }
  return JSON.parse(lastLine) as T;
}

interface ProvisionE2eChurchInput {
  id: string;
  name: string;
  slug: string;
  adminEmail: string;
}

interface ProvisionE2eChurchResult {
  churchId: string;
  invitationId: string;
}

/** Real Church Provisioning (spec 024 §2) — mints a Church Invitation to the first ChurchAdmin. */
function provisionE2eChurch(
  input: ProvisionE2eChurchInput,
): ProvisionE2eChurchResult {
  const output = runServerScript({
    scriptPath: 'src/scripts/e2e-provision-church.ts',
    args: [input.id, input.name, input.slug, input.adminEmail],
  });
  return parseLastJsonLine<ProvisionE2eChurchResult>(output);
}

interface MintE2eChurchInvitationInput {
  inviterEmail: string;
  inviterPassword: string;
  inviteeEmail: string;
  organizationId: string;
  role: 'member' | 'admin';
}

interface MintE2eChurchInvitationResult {
  invitationId: string;
}

/** A real Church Invitation from the ChurchAdmin to an ordinary Church Member. */
function mintE2eChurchInvitation(
  input: MintE2eChurchInvitationInput,
): MintE2eChurchInvitationResult {
  const output = runServerScript({
    scriptPath: 'src/scripts/e2e-mint-church-invitation.ts',
    args: [
      input.inviterEmail,
      input.inviterPassword,
      input.inviteeEmail,
      input.organizationId,
      input.role,
    ],
  });
  return parseLastJsonLine<MintE2eChurchInvitationResult>(output);
}

/**
 * Redeems a real Church Invitation for `creds` (account creation and
 * acceptance both happen server-side, in-process — public sign-up is
 * closed), then signs in over HTTP to give the caller's Playwright `ctx` a
 * usable session for `storageState()`.
 */
async function authUser({
  ctx,
  creds,
  invitationId,
}: AuthUserInput): Promise<string> {
  runServerScript({
    scriptPath: 'src/scripts/e2e-redeem-church-invitation.ts',
    args: [creds.email, creds.name, creds.password, invitationId],
  });
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
    email: makeUniqueEmail({ label: 'e2e-leader' }),
  };
  const teamLeaderCreds = {
    ...TEAM_LEADER_BASE,
    email: makeUniqueEmail({ label: 'e2e-teamleader' }),
  };
  const volunteerCreds = {
    ...VOLUNTEER_BASE,
    email: makeUniqueEmail({ label: 'e2e-volunteer' }),
  };
  const churchBAdminCreds = {
    ...CHURCH_B_ADMIN_BASE,
    email: makeUniqueEmail({ label: 'e2e-churchb-admin' }),
  };

  const [churchA, churchB] = [
    provisionE2eChurch({
      id: CHURCH_A_ID,
      name: 'E2E Church',
      slug: 'e2e-church',
      adminEmail: leaderCreds.email,
    }),
    provisionE2eChurch({
      id: CHURCH_B_ID,
      name: 'E2E ChurchB',
      slug: 'e2e-church-b',
      adminEmail: churchBAdminCreds.email,
    }),
  ];

  const [leaderId, churchBAdminId] = await Promise.all([
    authUser({
      ctx: leaderCtx,
      creds: leaderCreds,
      invitationId: churchA.invitationId,
    }),
    authUser({
      ctx: churchBAdminCtx,
      creds: churchBAdminCreds,
      invitationId: churchB.invitationId,
    }),
  ]);

  const teamLeaderInvitation = mintE2eChurchInvitation({
    inviterEmail: leaderCreds.email,
    inviterPassword: leaderCreds.password,
    inviteeEmail: teamLeaderCreds.email,
    organizationId: churchA.churchId,
    role: 'member',
  });
  const volunteerInvitation = mintE2eChurchInvitation({
    inviterEmail: leaderCreds.email,
    inviterPassword: leaderCreds.password,
    inviteeEmail: volunteerCreds.email,
    organizationId: churchA.churchId,
    role: 'member',
  });

  const [teamLeaderId, volunteerId] = await Promise.all([
    authUser({
      ctx: teamLeaderCtx,
      creds: teamLeaderCreds,
      invitationId: teamLeaderInvitation.invitationId,
    }),
    authUser({
      ctx: volunteerCtx,
      creds: volunteerCreds,
      invitationId: volunteerInvitation.invitationId,
    }),
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

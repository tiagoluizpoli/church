import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Playwright global setup (T126): provisions two authenticated users
 * (leader + sub-leader) and seeded domain data for the scheduling E2E specs.
 *
 *  1. Sign up (or sign in) the leader via Better Auth → capture user id.
 *  2. Sign up (or sign in) the sub-leader via Better Auth → capture user id.
 *  3. Shell out to the SERVER seed script (frontend stays DB-free).
 *  4. Persist both sessions to `tests/.auth/` so specs can opt in with
 *     `test.use({ storageState })` — existing unauthenticated specs untouched.
 */
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const SERVER_DIR = path.resolve(dirname, '../../server');

export const LEADER_STORAGE_STATE = path.resolve(dirname, '.auth/leader.json');
export const SUB_LEADER_STORAGE_STATE = path.resolve(
  dirname,
  '.auth/sub-leader.json',
);

const LEADER = {
  email: 'e2e-leader@test.com',
  password: 'e2e-Password-123',
  name: 'E2E Leader',
};

const SUB_LEADER = {
  email: 'e2e-subleader@test.com',
  password: 'e2e-Password-456',
  name: 'E2E Sub-Leader',
};

interface AuthResponse {
  user?: { id?: string };
}

async function authUser(
  ctx: Awaited<ReturnType<typeof request.newContext>>,
  creds: { email: string; password: string; name: string },
): Promise<string> {
  let res = await ctx.post(`${SERVER_URL}/api/auth/sign-in/email`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    res = await ctx.post(`${SERVER_URL}/api/auth/sign-up/email`, {
      data: creds,
    });
  }
  if (!res.ok()) {
    throw new Error(
      `Auth failed for ${creds.email} (${res.status()}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as AuthResponse;
  const userId = body.user?.id;
  if (!userId) {
    throw new Error(
      `Auth response for ${creds.email} did not include a user id`,
    );
  }
  return userId;
}

export default async function globalSetup(): Promise<void> {
  const leaderCtx = await request.newContext({ baseURL: SERVER_URL });
  const subLeaderCtx = await request.newContext({ baseURL: SERVER_URL });

  const [leaderId, subLeaderId] = await Promise.all([
    authUser(leaderCtx, LEADER),
    authUser(subLeaderCtx, SUB_LEADER),
  ]);

  execFileSync(
    'bun',
    [
      'run',
      'seed:e2e',
      '--',
      `--leader-user-id=${leaderId}`,
      `--sub-leader-user-id=${subLeaderId}`,
    ],
    { cwd: SERVER_DIR, stdio: 'inherit' },
  );

  await Promise.all([
    leaderCtx.storageState({ path: LEADER_STORAGE_STATE }),
    subLeaderCtx.storageState({ path: SUB_LEADER_STORAGE_STATE }),
  ]);

  await Promise.all([leaderCtx.dispose(), subLeaderCtx.dispose()]);
}

import { test as base, type Page } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  TEAM_LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from '../global-setup';

/**
 * E2E auth fixtures (T126).
 *
 * Global setup (`tests/global-setup.ts`) signs in/up the leader, seeds the
 * domain via the SERVER seed script (the frontend stays DB-free), and writes
 * the leader session to `LEADER_STORAGE_STATE`.
 *
 * Authenticated specs opt in:
 *   import { test, expect } from '../fixtures/auth';
 *   test.use({ storageState: LEADER_STORAGE_STATE });
 *
 * Existing unauthenticated specs (layout/theme/timezone/search) are untouched.
 */
export {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  TEAM_LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
};

const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

const LEADER = {
  email: 'e2e-leader@test.com',
  password: 'e2e-Password-123',
  name: 'E2E Leader',
};

interface SignUpResult {
  userId: string;
}

/**
 * Ad-hoc helper: signs up a leader via Better Auth and returns the user id.
 * Most specs should prefer `test.use({ storageState: LEADER_STORAGE_STATE })`.
 */
export async function signUpLeader(page: Page): Promise<SignUpResult> {
  const res = await page.request.post(`${SERVER_URL}/api/auth/sign-up/email`, {
    data: LEADER,
  });
  if (!res.ok()) {
    throw new Error(
      `Leader sign-up failed (${res.status()}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { user?: { id?: string } };
  const userId = body.user?.id;
  if (!userId) {
    throw new Error('Sign-up response did not include a user id');
  }
  return { userId };
}

export const test = base;
export { expect } from '@playwright/test';

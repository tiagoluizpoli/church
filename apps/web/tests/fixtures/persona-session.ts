import type { APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { assertServedFromPinnedTarget } from './e2e-target';
import { requiredE2eUrl } from './e2e-urls';

const AUTH_RESPONSE_SCHEMA = z.object({
  user: z.object({ id: z.string().min(1) }),
});

const ACTIVE_CHURCH_STATUS_SCHEMA = z.object({ status: z.string() });

export interface PersonaCredentials {
  email: string;
  password: string;
  name: string;
}

export interface SignInPersonaInput {
  request: APIRequestContext;
  credentials: PersonaCredentials;
}

/** Signs the persona in over HTTP on `request`'s session; returns its user id. */
export async function signInPersona({
  request,
  credentials,
}: SignInPersonaInput): Promise<string> {
  const serverUrl = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
  const res = await request.post(`${serverUrl}/api/auth/sign-in/email`, {
    data: { email: credentials.email, password: credentials.password },
  });
  if (!res.ok()) {
    throw new Error(
      `Auth failed for ${credentials.email} (${res.status()}): ${await res.text()}`,
    );
  }
  assertServedFromPinnedTarget({
    response: res,
    step: `sign in ${credentials.name}`,
  });
  return AUTH_RESPONSE_SCHEMA.parse(await res.json()).user.id;
}

export interface ResolveActiveChurchInput {
  request: APIRequestContext;
  name: string;
}

/**
 * Persists the session's Active Church before the browser uses it: global
 * setup does so for the shared personas before any worker starts, and a
 * journey fixture for its own persona before its test runs. Left
 * unresolved, the first concurrent requests each auto-select it and touch
 * the same Membership row in a repeatable-read transaction, and Postgres
 * fails all but one with a serialization error (500).
 */
export async function resolveActiveChurch({
  request,
  name,
}: ResolveActiveChurchInput): Promise<void> {
  const serverUrl = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
  const res = await request.get(`${serverUrl}/api/v1/active-church/status`);
  const body = res.ok()
    ? ACTIVE_CHURCH_STATUS_SCHEMA.parse(await res.json())
    : null;
  if (body?.status !== 'resolved') {
    throw new Error(
      `Active Church did not resolve for ${name} (${res.status()}): ${JSON.stringify(body)}`,
    );
  }
}

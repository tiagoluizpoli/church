import type { APIRequestContext, APIResponse } from '@playwright/test';
import { z } from 'zod';
import { assertServedFromPinnedTarget } from './e2e-target';
import { requiredE2eUrl } from './e2e-urls';

const AUTH_RESPONSE_SCHEMA = z.object({
  user: z.object({ id: z.string().min(1) }),
});

const RESOLVED_ACTIVE_CHURCH_SCHEMA = z.object({
  status: z.literal('resolved'),
  churchId: z.string().min(1),
});

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

interface ReadResolvedChurchIdInput {
  response: APIResponse;
  name: string;
  operation: 'status' | 'select';
  churchId?: string;
}

/** The resolved Church id, or a diagnostic naming persona, operation, HTTP status and attempted Church. */
async function readResolvedChurchId({
  response,
  name,
  operation,
  churchId,
}: ReadResolvedChurchIdInput): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = RESOLVED_ACTIVE_CHURCH_SCHEMA.safeParse(body);
  if (response.ok() && parsed.success) return parsed.data.churchId;
  throw new Error(
    `${activeChurchFailure({ name, operation, churchId })} (HTTP ${response.status()}): ${JSON.stringify(body)}`,
  );
}

function activeChurchFailure({
  name,
  operation,
  churchId,
}: Pick<ReadResolvedChurchIdInput, 'name' | 'operation' | 'churchId'>): string {
  const attempted = churchId ? ` for Church ${churchId}` : '';
  return `Active Church ${operation} failed for ${name}${attempted}`;
}

/**
 * Persists the session's Active Church before the browser uses it: global
 * setup does so for the shared personas before any worker starts, and a
 * journey fixture for its own persona before its test runs. Left
 * unresolved, the first concurrent requests each auto-select it and touch
 * the same Membership row in a repeatable-read transaction, and Postgres
 * fails all but one with a serialization error (500).
 *
 * The status call's own auto-select save is best-effort, so a resolved
 * status proves nothing: the Church is selected explicitly, whose save
 * failure is a 500.
 */
export async function resolveActiveChurch({
  request,
  name,
}: ResolveActiveChurchInput): Promise<void> {
  const serverUrl = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });
  const statusResponse = await request.get(
    `${serverUrl}/api/v1/active-church/status`,
  );
  const churchId = await readResolvedChurchId({
    response: statusResponse,
    name,
    operation: 'status',
  });
  const selectResponse = await request.post(
    `${serverUrl}/api/v1/active-church/select`,
    { data: { churchId } },
  );
  const selectedChurchId = await readResolvedChurchId({
    response: selectResponse,
    name,
    operation: 'select',
    churchId,
  });
  if (selectedChurchId !== churchId) {
    throw new Error(
      `${activeChurchFailure({ name, operation: 'select', churchId })}: the session selected ${selectedChurchId}`,
    );
  }
}

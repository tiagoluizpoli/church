import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { assertServedFromPinnedTarget } from '../e2e-target';
import { requiredE2eUrl } from '../e2e-urls';
import { newPersonaRequest, type RosteringPersona } from './rostering-church';

/**
 * Actions the identity journeys (invitation, redemption, church switching,
 * transfer, cross-tenant) share: minting a Ministry Invitation through the
 * product, the `/login` form, and typed reads of the server's JSON.
 */

interface ServerUrlInput {
  path: string;
}

/** Absolute, so it resolves the same on a page's request (web base URL) and a persona request (server base URL). */
function serverUrl({ path }: ServerUrlInput): string {
  return `${requiredE2eUrl({ variable: 'VITE_SERVER_URL' })}${path}`;
}

export interface AssertOkInput {
  res: APIResponse;
  action: string;
}

/** Fails loudly on a non-2xx response instead of surfacing a confusing downstream error. */
export async function assertOk({ res, action }: AssertOkInput): Promise<void> {
  if (res.ok()) return;
  throw new Error(`Failed to ${action} (${res.status()}): ${await res.text()}`);
}

export interface MintedMinistryInvitation {
  id: string;
  kind: 'ministry-only' | 'chained';
  redemptionPath: string;
}

export interface MintMinistryInvitationInput {
  /** An API context signed in as the Ministry's Church admin, with the server as its base URL. */
  request: APIRequestContext;
  ministryId: string;
  email: string;
  roleIds: string[];
}

/** Mints a Volunteer-level Ministry Invitation as the request's actor. */
export async function mintMinistryInvitation({
  request,
  ministryId,
  email,
  roleIds,
}: MintMinistryInvitationInput): Promise<MintedMinistryInvitation> {
  const res = await request.post(
    serverUrl({ path: `/api/v1/ministries/${ministryId}/invitations` }),
    { data: { email, ministryAccessLevel: 'volunteer', roleIds } },
  );
  await assertOk({ res, action: `mint a Ministry invitation for ${email}` });
  assertServedFromPinnedTarget({
    response: res,
    step: 'provision Ministry Invitation',
  });
  return (await res.json()) as MintedMinistryInvitation;
}

/** What the `/login` form takes. */
export type SignInCredentials = Pick<RosteringPersona, 'email' | 'password'>;

export interface MintMinistryInvitationAsInput {
  /** The Church admin who mints; signed in on its own API context. */
  persona: RosteringPersona;
  ministryId: string;
  email: string;
  roleIds: string[];
}

/** Mints as `persona` on a context of its own, disposed afterwards. */
export async function mintMinistryInvitationAs({
  persona,
  ministryId,
  email,
  roleIds,
}: MintMinistryInvitationAsInput): Promise<MintedMinistryInvitation> {
  const request = await newPersonaRequest({ persona });
  try {
    return await mintMinistryInvitation({
      request,
      ministryId,
      email,
      roleIds,
    });
  } finally {
    await request.dispose();
  }
}

export interface SignInInput {
  page: Page;
  persona: SignInCredentials;
}

/** `/login` renders the sign-in view only (#62) — no toggle to reach it. */
export async function signIn({ page, persona }: SignInInput): Promise<void> {
  await page.getByLabel('Email').fill(persona.email);
  await page.getByLabel('Password').fill(persona.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

export interface FetchJsonInput {
  request: APIRequestContext;
  /** A server path such as `/api/v1/volunteer/dashboard`. */
  path: string;
}

export interface RequestInput {
  request: APIRequestContext;
}

/** GETs `path` on the server as the request's actor and parses the JSON as `T`; throws on a non-2xx response. */
export async function fetchJson<T>({
  request,
  path,
}: FetchJsonInput): Promise<T> {
  const res = await request.get(serverUrl({ path }));
  await assertOk({ res, action: `GET ${path}` });
  return (await res.json()) as T;
}

export interface ActiveChurchStatus {
  status: string;
  churchId?: string;
}

/** The caller's Active Church status as the server reports it. */
export function fetchActiveChurchStatus({
  request,
}: RequestInput): Promise<ActiveChurchStatus> {
  return fetchJson<ActiveChurchStatus>({
    request,
    path: '/api/v1/active-church/status',
  });
}

export interface VolunteerMinistryOption {
  id: string;
  name: string;
}

export interface VolunteerDashboardMinistryOptions {
  ministryOptions: VolunteerMinistryOption[];
}

/** The Ministries the caller volunteers in, from the Volunteer dashboard. */
export async function fetchVolunteerMinistryOptions({
  request,
}: RequestInput): Promise<VolunteerMinistryOption[]> {
  const { ministryOptions } =
    await fetchJson<VolunteerDashboardMinistryOptions>({
      request,
      path: '/api/v1/volunteer/dashboard',
    });
  return ministryOptions;
}

/** The accept response of a Ministry Invitation; which fields appear depends on `kind`. */
export interface AcceptMinistryInvitationOutcome {
  kind: string;
  volunteerId?: string;
  sourceChurchName?: string;
  destinationChurchName?: string;
}

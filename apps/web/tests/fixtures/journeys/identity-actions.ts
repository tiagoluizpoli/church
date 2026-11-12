import { m } from '@church/i18n/messages';
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
} from '@playwright/test';
import { type AssignPersona, newPersonaRequest } from './assign-church';
import { assertServedFromPinnedTarget } from '@/tests/fixtures/e2e-target';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';

/**
 * Actions the identity journeys (invitation, redemption, church switching,
 * transfer, cross-tenant) share: minting a Ministry Invitation through the
 * product, the `/login` form, and typed reads of the server's JSON.
 */

const PT = { locale: 'pt-BR' } as const;

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
  /** Volunteer by default; a Volunteer offer needs at least one Role. */
  ministryAccessLevel?: 'leader' | 'volunteer';
}

/** Mints a Ministry Invitation as the request's actor. */
export async function mintMinistryInvitation({
  request,
  ministryId,
  email,
  roleIds,
  ministryAccessLevel = 'volunteer',
}: MintMinistryInvitationInput): Promise<MintedMinistryInvitation> {
  const res = await request.post(
    serverUrl({ path: `/api/v1/ministries/${ministryId}/invitations` }),
    { data: { email, ministryAccessLevel, roleIds } },
  );
  await assertOk({ res, action: `mint a Ministry invitation for ${email}` });
  assertServedFromPinnedTarget({
    response: res,
    step: 'provision Ministry Invitation',
  });
  return (await res.json()) as MintedMinistryInvitation;
}

export interface MintAdminInvitationAsInput {
  /** The Church admin who invites; signed in on its own API context. */
  persona: AssignPersona;
  email: string;
}

/** Invites `email` as ChurchAdmin, raising a pending member offer in place. */
export async function mintAdminInvitationAs({
  persona,
  email,
}: MintAdminInvitationAsInput): Promise<void> {
  const request = await newPersonaRequest({ persona });
  try {
    const res = await request.post(
      serverUrl({ path: '/api/v1/invitations/admin' }),
      { data: { email } },
    );
    await assertOk({ res, action: `invite ${email} as ChurchAdmin` });
  } finally {
    await request.dispose();
  }
}

export interface RevokeMinistryInvitationAsInput {
  persona: AssignPersona;
  ministryId: string;
  invitationId: string;
}

/** Revokes one Ministry Invitation as `persona`. */
export async function revokeMinistryInvitationAs({
  persona,
  ministryId,
  invitationId,
}: RevokeMinistryInvitationAsInput): Promise<void> {
  const request = await newPersonaRequest({ persona });
  try {
    const res = await request.post(
      serverUrl({
        path: `/api/v1/ministries/${ministryId}/invitations/${invitationId}/revoke`,
      }),
    );
    await assertOk({
      res,
      action: `revoke Ministry invitation ${invitationId}`,
    });
  } finally {
    await request.dispose();
  }
}

/** What the `/login` form takes. */
export type SignInCredentials = Pick<AssignPersona, 'email' | 'password'>;

export interface MintMinistryInvitationAsInput {
  /** The Church admin who mints; signed in on its own API context. */
  persona: AssignPersona;
  ministryId: string;
  email: string;
  roleIds: string[];
  ministryAccessLevel?: 'leader' | 'volunteer';
}

/** Mints as `persona` on a context of its own, disposed afterwards. */
export async function mintMinistryInvitationAs({
  persona,
  ministryId,
  email,
  roleIds,
  ministryAccessLevel,
}: MintMinistryInvitationAsInput): Promise<MintedMinistryInvitation> {
  const request = await newPersonaRequest({ persona });
  try {
    return await mintMinistryInvitation({
      request,
      ministryId,
      email,
      roleIds,
      ministryAccessLevel,
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
  await page
    .getByLabel(m.password_recovery_email_label({}, PT))
    .fill(persona.email);
  await page
    .getByLabel(m.auth_password_label({}, PT), { exact: true })
    .fill(persona.password);
  await page
    .getByRole('button', { name: m.auth_sign_in_submit({}, PT) })
    .click();
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

export interface FetchDebugVerificationCodeInput {
  request: APIRequestContext;
  /** The Church Invitation id the public join page was opened with. */
  churchInvitationId: string;
}

interface DebugVerificationCodeResponse {
  code: string;
}

/** The code the capture sender recorded, through the non-production inspector. */
export async function fetchDebugVerificationCode({
  request,
  churchInvitationId,
}: FetchDebugVerificationCodeInput): Promise<string> {
  const { code } = await fetchJson<DebugVerificationCodeResponse>({
    request,
    path: `/api/v1/redemption/church/${churchInvitationId}/debug-code`,
  });
  return code;
}

export interface FetchEmailedJoiningPathInput {
  request: APIRequestContext;
  email: string;
}

interface DebugInvitationLinkResponse {
  redemptionUrl: string;
}

/**
 * The joining link the latest invitation email to `email` actually carried,
 * read from the capture sender through the non-production inspector, as a
 * path on the web app. Polls while the outbox worker has not sent it yet.
 */
export async function fetchEmailedJoiningPath({
  request,
  email,
}: FetchEmailedJoiningPathInput): Promise<string> {
  const path = `/api/v1/redemption/debug-invitation-link?email=${encodeURIComponent(email)}`;
  let redemptionUrl: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(serverUrl({ path }));
        if (res.ok())
          ({ redemptionUrl } =
            (await res.json()) as DebugInvitationLinkResponse);
        return redemptionUrl;
      },
      { timeout: 20_000, message: `No invitation email captured for ${email}` },
    )
    .toBeDefined();
  return new URL(redemptionUrl as string).pathname;
}

export interface ChurchInvitationIdOfInput {
  redemptionPath: string;
}

/** A Church Invitation link is `/invitations/church/<Church Invitation id>`. */
export function churchInvitationIdOf({
  redemptionPath,
}: ChurchInvitationIdOfInput): string {
  const id = redemptionPath.match(/^\/invitations\/church\/([^/?#]+)$/)?.[1];
  if (!id) throw new Error(`Not a Church Invitation link: ${redemptionPath}`);
  return id;
}

export interface ListedInvitation {
  id: string;
  email: string;
  churchInvitationId?: string;
  displayStatus: string;
}

export interface FindListedInvitationInput {
  request: APIRequestContext;
  email: string;
}

/**
 * The pending offer the Invitations page lists for `email`, as the request's
 * actor sees it. Its `churchInvitationId` is what the emailed link carries.
 */
export async function findListedInvitation({
  request,
  email,
}: FindListedInvitationInput): Promise<ListedInvitation> {
  const { items } = await fetchJson<{ items: ListedInvitation[] }>({
    request,
    path: `/api/v1/invitations?email=${encodeURIComponent(email)}`,
  });
  const [found] = items;
  if (!found) throw new Error(`No listed invitation for ${email}`);
  return found;
}

export interface JoinedOutcome {
  kind: string;
  volunteerId?: string | null;
}

export interface JoinViaLinkInput {
  page: Page;
  redemptionPath: string;
  email: string;
  name: string;
  password: string;
  churchName: string;
}

/**
 * A new person's public join: opens the link, asks for the code, reads it
 * from the capture sender, and submits. Returns the redeem outcome.
 */
export async function joinViaLink({
  page,
  redemptionPath,
  email,
  name,
  password,
  churchName,
}: JoinViaLinkInput): Promise<JoinedOutcome> {
  const churchInvitationId = churchInvitationIdOf({ redemptionPath });
  await page.goto(redemptionPath);
  await page
    .getByRole('heading', { name: m.join_title({ churchName }, PT) })
    .waitFor();
  if (
    (await page.getByLabel(m.join_email_label({}, PT)).inputValue()) !== email
  )
    throw new Error(`The join page is not addressed to ${email}`);
  await page.getByRole('button', { name: m.join_send_code({}, PT) }).click();
  await page
    .getByLabel(m.join_code_label({}, PT))
    .waitFor({ timeout: 15_000 })
    .catch(async (error: unknown) => {
      throw new Error(
        `No code field for ${email}: ${(await page.locator('body').innerText()).slice(0, 400)}`,
        { cause: error },
      );
    });
  const code = await fetchDebugVerificationCode({
    request: page.request,
    churchInvitationId,
  });
  await page.getByLabel(m.join_code_label({}, PT)).fill(code);
  await page.getByLabel(m.join_name_label({}, PT)).fill(name);
  await page
    .getByLabel(m.join_password_label({}, PT), { exact: true })
    .fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith(`/redemption/church/${churchInvitationId}/redeem`),
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: m.join_submit({}, PT) }).click(),
  ]).catch(async (error: unknown) => {
    throw new Error(
      `Join as ${email} got no answer: ${(await page.locator('body').innerText()).slice(0, 400)}`,
      { cause: error },
    );
  });
  assertServedFromPinnedTarget({ response, step: `join as ${email}` });
  return (await response.json()) as JoinedOutcome;
}

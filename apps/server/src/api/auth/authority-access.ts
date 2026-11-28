/**
 * The authority guards every controller shares. The order is fixed here:
 * 403 when the caller lacks the function, then 404 for an object they may
 * not reach, indistinguishable from a missing one.
 *
 * `FastifyReply` is thenable: it resolves once the response is flushed, so an
 * `async` guard returning `reply.send(...)` would adopt that resolution, not
 * the reply. A guard therefore sends its refusal as a side effect and returns
 * a plain value (`true`, or `undefined` once refused); its caller returns as
 * soon as it sees one, and never awaits or branches on a reply.
 */
import {
  type MinistryId,
  MinistryParticipationId,
  ShiftId,
} from '../../domain/branded-ids';
import { refuse } from '../utils/refuse';
import { requestCaller } from '../utils/request-caller';
import type {
  AuthorityAccessInput,
  ChurchAdminHook,
  CreateChurchAdminHookInput,
  DenyMinistryManagementInput,
  DenyParticipationScopeInput,
  DenyRefusedDecisionInput,
  DenyShiftScopeInput,
  DenyUnmanagedMinistryInput,
  LeadershipScope,
  ResolveManagedMinistryInput,
} from './authority-access.types';

/** 403 for a caller with no Ministry-management function. */
export async function denyMinistryFunction({
  authorityGuard,
  request,
  reply,
}: AuthorityAccessInput): Promise<boolean> {
  const decision = await authorityGuard.decideManageAnyMinistry(
    requestCaller({ request }),
  );
  if (decision.allowed) return false;
  refuse({ reply, request, code: 'FORBIDDEN' });
  return true;
}

/** 404 for a Ministry the caller may not manage, as for a missing one. */
export async function denyUnmanagedMinistry({
  authorityGuard,
  request,
  reply,
  ministryId,
}: DenyUnmanagedMinistryInput): Promise<boolean> {
  const decision = await authorityGuard.decideManageMinistry({
    ...requestCaller({ request }),
    ministryId,
  });
  if (decision.allowed) return false;
  refuse({ reply, request, code: 'NOT_FOUND' });
  return true;
}

/** The function check (403), then, given a Ministry, the object check (404). */
export async function denyMinistryManagement({
  ministryId,
  ...access
}: DenyMinistryManagementInput): Promise<boolean> {
  if (await denyMinistryFunction(access)) return true;
  if (!ministryId) return false;
  return denyUnmanagedMinistry({ ...access, ministryId });
}

/**
 * `denyMinistryManagement`, then an archived Ministry is 404 too. Returns the
 * Ministry, or undefined once refused.
 */
export async function resolveManagedMinistry({
  ministryManager,
  ministryId,
  ...access
}: ResolveManagedMinistryInput): Promise<MinistryId | undefined> {
  if (await denyMinistryManagement({ ...access, ministryId })) return undefined;
  await ministryManager.getActive({
    churchId: access.request.churchId,
    ministryId,
  });
  return ministryId;
}

/**
 * For an object decision already taken: nothing when allowed, else 403 when
 * the caller has no Ministry-management function and 404 when they have one.
 * The function is asked only after a refusal, so an allowed request pays
 * for one decision.
 */
export async function denyRefusedDecision({
  allowed,
  ...access
}: DenyRefusedDecisionInput): Promise<boolean> {
  if (allowed) return false;
  if (await denyMinistryFunction(access)) return true;
  refuse({ reply: access.reply, request: access.request, code: 'NOT_FOUND' });
  return true;
}

/** `denyRefusedDecision` for managing the Shift. */
export async function denyShiftScope({
  shiftId,
  ...access
}: DenyShiftScopeInput): Promise<boolean> {
  const decision = await access.authorityGuard.decideManageShift({
    ...requestCaller(access),
    shiftId: ShiftId.from(shiftId),
  });
  return denyRefusedDecision({ ...access, allowed: decision.allowed });
}

/** `denyRefusedDecision` for managing the Ministry Participation. */
export async function denyParticipationScope({
  participationId,
  ...access
}: DenyParticipationScopeInput): Promise<boolean> {
  const decision = await access.authorityGuard.decideManageParticipation({
    ...requestCaller(access),
    participationId: MinistryParticipationId.from(participationId),
  });
  return denyRefusedDecision({ ...access, allowed: decision.allowed });
}

/**
 * The caller's reach: every Ministry for a ChurchAdmin (a person who is both
 * gets admin behavior), else the Ministries they lead. 403, returning
 * undefined, for a caller who is neither.
 */
export async function resolveLeadershipScope({
  authorityGuard,
  request,
  reply,
}: AuthorityAccessInput): Promise<LeadershipScope | undefined> {
  const { isChurchAdmin, ledMinistries } =
    await authorityGuard.resolveCallerCapabilities(requestCaller({ request }));
  if (isChurchAdmin) return { kind: 'church' };
  if (ledMinistries.length === 0) {
    refuse({ reply, request, code: 'FORBIDDEN' });
    return undefined;
  }
  return {
    kind: 'ministries',
    ministryIds: ledMinistries.map(({ ministryId }) => ministryId),
  };
}

/**
 * 403 for anyone but a ChurchAdmin. Register it as a controller's
 * `preValidation` hook (after Active Church) to gate every route before its
 * input is validated, or as one route's `preHandler` to gate it after.
 */
export function createChurchAdminHook({
  authorityGuard,
}: CreateChurchAdminHookInput): ChurchAdminHook {
  // named-parameters-ignore: Fastify hook signature (request, reply)
  return async (request, reply) => {
    const allowed = await authorityGuard.canManageChurch(
      requestCaller({ request }),
    );
    if (!allowed) return refuse({ reply, request, code: 'FORBIDDEN' });
    return undefined;
  };
}

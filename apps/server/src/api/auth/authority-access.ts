/**
 * The authority guards every controller shares. Each one is an assertion:
 * it returns when the caller may go on and throws a `RefusalError` the
 * global error handler answers. The order is fixed here: 403 when the caller
 * lacks the function, then 404 for an object they may not reach,
 * indistinguishable from a missing one.
 */
import {
  type MinistryId,
  MinistryParticipationId,
  ShiftId,
} from '../../domain/branded-ids';
import { RefusalError } from '../utils/refusal-error';
import { requestCaller } from '../utils/request-caller';
import type {
  AssertAllowedDecisionInput,
  AssertManagedMinistryInput,
  AssertMinistryManagementInput,
  AssertParticipationScopeInput,
  AssertShiftScopeInput,
  AuthorityAccessInput,
  ChurchAdminHook,
  CreateChurchAdminHookInput,
  LeadershipScope,
  ResolveManagedMinistryInput,
} from './authority-access.types';

/** 403 for a caller with no Ministry-management function. */
export async function assertMinistryFunction({
  authorityGuard,
  request,
}: AuthorityAccessInput): Promise<void> {
  const decision = await authorityGuard.decideManageAnyMinistry(
    requestCaller({ request }),
  );
  if (!decision.allowed) throw new RefusalError({ code: 'FORBIDDEN' });
}

/** 404 for a Ministry the caller may not manage, as for a missing one. */
export async function assertManagedMinistry({
  authorityGuard,
  request,
  ministryId,
}: AssertManagedMinistryInput): Promise<void> {
  const decision = await authorityGuard.decideManageMinistry({
    ...requestCaller({ request }),
    ministryId,
  });
  if (!decision.allowed) throw new RefusalError({ code: 'NOT_FOUND' });
}

/** The function check (403), then, given a Ministry, the object check (404). */
export async function assertMinistryManagement({
  ministryId,
  ...access
}: AssertMinistryManagementInput): Promise<void> {
  await assertMinistryFunction(access);
  if (ministryId) await assertManagedMinistry({ ...access, ministryId });
}

/**
 * `assertMinistryManagement`, then an archived Ministry is 404 too. Returns
 * the Ministry.
 */
export async function resolveManagedMinistry({
  ministryManager,
  ministryId,
  ...access
}: ResolveManagedMinistryInput): Promise<MinistryId> {
  await assertMinistryManagement({ ...access, ministryId });
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
export async function assertAllowedDecision({
  allowed,
  ...access
}: AssertAllowedDecisionInput): Promise<void> {
  if (allowed) return;
  await assertMinistryFunction(access);
  throw new RefusalError({ code: 'NOT_FOUND' });
}

/** `assertAllowedDecision` for managing the Shift. */
export async function assertShiftScope({
  shiftId,
  ...access
}: AssertShiftScopeInput): Promise<void> {
  const decision = await access.authorityGuard.decideManageShift({
    ...requestCaller(access),
    shiftId: ShiftId.from(shiftId),
  });
  await assertAllowedDecision({ ...access, allowed: decision.allowed });
}

/** `assertAllowedDecision` for managing the Ministry Participation. */
export async function assertParticipationScope({
  participationId,
  ...access
}: AssertParticipationScopeInput): Promise<void> {
  const decision = await access.authorityGuard.decideManageParticipation({
    ...requestCaller(access),
    participationId: MinistryParticipationId.from(participationId),
  });
  await assertAllowedDecision({ ...access, allowed: decision.allowed });
}

/**
 * The caller's reach: every Ministry for a ChurchAdmin (a person who is both
 * gets admin behavior), else the Ministries they lead. 403 for a caller who
 * is neither.
 */
export async function resolveLeadershipScope({
  authorityGuard,
  request,
}: AuthorityAccessInput): Promise<LeadershipScope> {
  const { isChurchAdmin, ledMinistries } =
    await authorityGuard.resolveCallerCapabilities(requestCaller({ request }));
  if (isChurchAdmin) return { kind: 'church' };
  if (ledMinistries.length === 0) throw new RefusalError({ code: 'FORBIDDEN' });
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
  return async (request) => {
    const allowed = await authorityGuard.canManageChurch(
      requestCaller({ request }),
    );
    if (!allowed) throw new RefusalError({ code: 'FORBIDDEN' });
  };
}

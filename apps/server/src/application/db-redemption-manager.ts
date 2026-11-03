import { compareInstants, fromDate, nowAsDate, toDate } from '@church/time';
import type {
  ChurchId,
  ChurchInvitationId,
  MinistryInvitationId,
  VolunteerId,
} from '../domain/branded-ids';
import type { InvitationVerificationCodeManager } from '../domain/contracts/application/invitation-verification-code-manager';
import type {
  AcceptExistingMemberInput,
  AcceptExistingMemberOutcome,
  AcceptPendingMinistryInvitationInput,
  AuthenticatedInvitationStatus,
  ChurchOnlyRedemptionOutcome,
  DeclineChurchInvitationInput,
  DeclineChurchInvitationOutcome,
  DeclineInvitationInput,
  DeclineInvitationOutcome,
  FullRedemptionSuccess,
  GetAuthenticatedInvitationStatusInput,
  GetDebugInvitationLinkInput,
  GetDebugVerificationCodeInput,
  GetPublicRedemptionPreviewInput,
  PublicRedemptionMinistry,
  PublicRedemptionPreview,
  RedeemNewUserInput,
  RedeemNewUserOutcome,
  RedemptionManager,
  RequestRedemptionCodeInput,
} from '../domain/contracts/application/redemption-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type {
  MinistryInvitationContext,
  MinistryInvitationRepository,
} from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { RedemptionRepository } from '../domain/contracts/infrastructure/redemption.repository';
import type { RedemptionFailureLog } from '../domain/contracts/infrastructure/redemption-failure-log';
import type {
  RedemptionIdentityGateway,
  RejectChurchInvitationInput,
} from '../domain/contracts/infrastructure/redemption-identity-gateway';
import type { SecurityLogRepository } from '../domain/contracts/infrastructure/security-log.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VerificationCodeInspector } from '../domain/contracts/infrastructure/verification-code-inspector';
import type { MinistryInvitation } from '../domain/entities/ministry-invitation';
import { CrossChurchVolunteerConflictError } from '../domain/errors/cross-church-volunteer-conflict';
import { InvitationNotPendingError } from '../domain/errors/invitation-not-pending';
import { PendingMinistryInvitationNotFoundError } from '../domain/errors/pending-ministry-invitation-not-found';
import { VerificationCodeError } from '../domain/errors/verification-code-error';
import { maskEmail } from '../domain/services/mask-email';

interface DbRedemptionManagerDependencies {
  churchRepository: ChurchRepository;
  identityGateway: RedemptionIdentityGateway;
  invitationRepository: MinistryInvitationRepository;
  invitationVerificationCodeManager: InvitationVerificationCodeManager;
  redemptionRepository: RedemptionRepository;
  securityLogRepository: SecurityLogRepository;
  unitOfWork: UnitOfWork;
  failureLog: RedemptionFailureLog;
  /** Non-production only — see `getDebugVerificationCode`. */
  verificationCodeInspector?: VerificationCodeInspector;
}

interface DescribeChurchOnlySplitInput {
  error: CrossChurchVolunteerConflictError;
  /** The invitation's Church — where Church Membership was granted. */
  churchId: AcceptPendingMinistryInvitationInput['churchId'];
  destinationChurchName: string;
  ministryInvitationId: AcceptPendingMinistryInvitationInput['ministryInvitationId'];
  ministryName: string;
  userId: AcceptPendingMinistryInvitationInput['userId'];
  correlationId: string;
  now: Date;
}

interface AdmitNewPersonInput {
  preview: PublicRedemptionPreview;
  name: string;
  password: string;
  correlationId: string;
  now: Date;
  tx: TransactionContext;
}

interface AdmittedChurchOnly {
  kind: 'church-only';
  sourceChurchId: ChurchId;
  /** The headline half named to the caller; every half stays pending. */
  ministry: PublicRedemptionMinistry;
  sessionCookie: string;
}

type AdmittedNewPerson = FullRedemptionSuccess | AdmittedChurchOnly;

interface ClassifyIdentityFailureInput {
  email: string;
}

interface ChurchOnlyOutcomeInput {
  sourceChurchId: ChurchId;
  destinationChurchId: ChurchId;
  destinationChurchName: string;
  ministryInvitationId: AcceptPendingMinistryInvitationInput['ministryInvitationId'];
  ministryName: string;
}

interface MinistryGrantFailureInput {
  cause: unknown;
}

/** Marks a throw from the Ministry grant step, so the rollback reports it as such. */
class MinistryGrantFailure extends Error {
  constructor({ cause }: MinistryGrantFailureInput) {
    super('Ministry grant failed during new-person admission.', { cause });
  }
}

/** Marks a throw from Better Auth's Church-half rejection, so the decline reports it as such. */
class IdentityRejectFailure extends Error {
  constructor({ cause }: MinistryGrantFailureInput) {
    super('Church Invitation rejection failed during decline.', { cause });
  }
}

interface ResolveInvitationContextInput {
  ministryInvitationId: AcceptExistingMemberInput['ministryInvitationId'];
  userId: AcceptExistingMemberInput['userId'];
  now: Date;
  /** The attempt's own correlation id, when the caller has one (e.g. `acceptExistingMember`'s idempotency key). */
  correlationId?: string;
}

type ResolvedInvitationContext =
  | { status: 'unavailable' }
  | { status: 'identity-mismatch'; addressedEmail: string }
  | { status: 'already-accepted'; ministryInvitation: MinistryInvitation }
  | { status: 'redeemable'; context: MinistryInvitationContext };

interface AcceptWithSiblingsInput {
  ministryInvitation: MinistryInvitation;
  userId: AcceptExistingMemberInput['userId'];
  acceptedAt: Date;
  correlationId: string;
}

interface IsInvitationRedeemableInput {
  ministryInvitation: MinistryInvitation;
  now: Date;
}

/** Pending and not yet past its `expiresAt` — the shared gate every redemption path checks before proceeding. */
function isInvitationRedeemable({
  ministryInvitation,
  now,
}: IsInvitationRedeemableInput): boolean {
  return (
    ministryInvitation.status === 'pending' &&
    compareInstants({
      left: ministryInvitation.expiresAt,
      right: fromDate({ date: now }),
    }) > 0
  );
}

interface EnsureChurchInvitationPendingInput {
  churchId: ChurchId;
  churchInvitationId: string;
  tx: TransactionContext;
}

/**
 * Checkpoint three from spec §7.4. This is intentionally transport-free: #99
 * will authenticate and call it, while this operation owns the sole database
 * transaction that creates grants and consumes the Ministry Invitation.
 */
export class DbRedemptionManager implements RedemptionManager {
  private readonly churchRepository: ChurchRepository;
  private readonly identityGateway: RedemptionIdentityGateway;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly invitationVerificationCodeManager: InvitationVerificationCodeManager;
  private readonly redemptionRepository: RedemptionRepository;
  private readonly securityLogRepository: SecurityLogRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly failureLog: RedemptionFailureLog;
  private readonly verificationCodeInspector:
    | VerificationCodeInspector
    | undefined;

  constructor({
    churchRepository,
    identityGateway,
    invitationRepository,
    invitationVerificationCodeManager,
    redemptionRepository,
    securityLogRepository,
    unitOfWork,
    failureLog,
    verificationCodeInspector,
  }: DbRedemptionManagerDependencies) {
    this.churchRepository = churchRepository;
    this.identityGateway = identityGateway;
    this.invitationRepository = invitationRepository;
    this.invitationVerificationCodeManager = invitationVerificationCodeManager;
    this.redemptionRepository = redemptionRepository;
    this.securityLogRepository = securityLogRepository;
    this.unitOfWork = unitOfWork;
    this.failureLog = failureLog;
    this.verificationCodeInspector = verificationCodeInspector;
  }

  async getPublicPreview({
    churchInvitationId,
    now = nowAsDate(),
  }: GetPublicRedemptionPreviewInput): Promise<PublicRedemptionPreview | null> {
    return this.invitationRepository.findPublicRedemptionPreview({
      churchInvitationId,
      now,
    });
  }

  async requestVerificationCode({
    churchInvitationId,
    now = nowAsDate(),
  }: RequestRedemptionCodeInput): Promise<boolean> {
    const preview = await this.getPublicPreview({ churchInvitationId, now });
    if (!preview) return false;
    await this.invitationVerificationCodeManager.issue({
      churchInvitationId,
      recipientEmail: preview.email,
      churchName: preview.churchName,
      now,
    });
    return true;
  }

  async redeemNewUser({
    churchInvitationId,
    name,
    password,
    code,
    idempotencyKey,
    now = nowAsDate(),
  }: RedeemNewUserInput): Promise<RedeemNewUserOutcome> {
    const preview = await this.getPublicPreview({ churchInvitationId, now });
    if (!preview)
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    try {
      await this.invitationVerificationCodeManager.verify({
        churchInvitationId,
        code,
        idempotencyKey,
        now,
      });
    } catch (error) {
      if (error instanceof VerificationCodeError) {
        return { kind: 'terminal-failure', reason: 'VERIFICATION_FAILED' };
      }
      throw error;
    }
    try {
      const committed = await this.unitOfWork.run((tx) =>
        this.admitNewPerson({
          preview,
          name,
          password,
          correlationId: idempotencyKey,
          now,
          tx,
        }),
      );
      if (committed.kind === 'full-success') return committed;
      const outcome = await this.churchOnlyOutcome({
        sourceChurchId: committed.sourceChurchId,
        destinationChurchId: preview.churchId,
        destinationChurchName: preview.churchName,
        ministryInvitationId: committed.ministry.ministryInvitationId,
        ministryName: committed.ministry.ministryName,
      });
      return { ...outcome, sessionCookie: committed.sessionCookie };
    } catch (error) {
      if (error instanceof InvitationNotPendingError)
        return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
      const reason =
        error instanceof MinistryGrantFailure
          ? 'MINISTRY_ACCEPTANCE_FAILED'
          : await this.classifyIdentityFailure({ email: preview.email });
      const cause = error instanceof MinistryGrantFailure ? error.cause : error;
      this.failureLog.record({
        reason,
        churchInvitationId,
        ministryInvitationId:
          preview.ministries[0]?.ministryInvitationId ?? null,
        correlationId: idempotencyKey,
        errorName: cause instanceof Error ? cause.name : typeof cause,
      });
      if (reason === 'EMAIL_ALREADY_REGISTERED')
        return { kind: 'terminal-failure', reason };
      return { kind: 'retryable-failure', reason };
    }
  }

  /**
   * One transaction for identity, session, Church admission and any paired
   * Ministry grants: any throw rolls all of them back, and the caller only
   * sees the session cookie after commit. The verification code is consumed
   * before, keyed by the idempotency key, so the same request can be retried.
   */
  private async admitNewPerson({
    preview,
    name,
    password,
    correlationId,
    now,
    tx,
  }: AdmitNewPersonInput): Promise<AdmittedNewPerson> {
    // Ministry rows before the Church Invitation: a racing archive's order.
    await this.redemptionRepository.lockInvitedMinistries({
      churchId: preview.churchId,
      ministryInvitationIds: preview.ministries.map(
        (half) => half.ministryInvitationId,
      ),
      tx,
    });
    await this.ensureChurchInvitationPending({
      churchId: preview.churchId,
      churchInvitationId: preview.churchInvitationId,
      tx,
    });
    const account = await this.identityGateway.createAccount({
      email: preview.email,
      name,
      password,
      tx,
    });
    const { sessionCookie, userId } = account;
    await this.identityGateway.acceptChurchInvitation({
      churchInvitationId: preview.churchInvitationId,
      sessionCookie,
      tx,
    });
    await this.redemptionRepository.recordChurchInvitationAcceptance({
      churchInvitationId: preview.churchInvitationId,
      userId,
      acceptedAt: now,
      tx,
    });
    await this.identityGateway.setActiveChurch({
      churchId: preview.churchId,
      sessionCookie,
      tx,
    });
    const [headline] = preview.ministries;
    if (!headline)
      return { kind: 'full-success', volunteerId: null, sessionCookie };
    const grant = {
      churchId: preview.churchId,
      userId,
      correlationId,
      tx,
    };
    try {
      // Every pending half joins the one Volunteer profile in this transaction.
      let volunteerId: VolunteerId | null = null;
      for (const half of preview.ministries) {
        volunteerId =
          await this.redemptionRepository.acceptPendingMinistryInvitation({
            ...grant,
            ministryInvitationId: half.ministryInvitationId,
            acceptedAt: now,
            auditAction: 'acceptance',
          });
      }
      return { kind: 'full-success', volunteerId, sessionCookie };
    } catch (error) {
      if (!(error instanceof CrossChurchVolunteerConflictError))
        throw new MinistryGrantFailure({ cause: error });
      // Refused before any grant write: the Church admission still commits.
      for (const half of preview.ministries) {
        await this.redemptionRepository.recordChurchOnlyPartialAcceptance({
          ...grant,
          ministryInvitationId: half.ministryInvitationId,
          recordedAt: now,
        });
      }
      return {
        kind: 'church-only',
        sourceChurchId: error.sourceChurchId,
        ministry: headline,
        sessionCookie,
      };
    }
  }

  /** After rollback: a committed User with this email (pre-existing or a racing signup) is never touched. */
  /**
   * Row-locks the Church Invitation before Better Auth accepts it: that write
   * is unconditional, so without the lock a revoke committing in between
   * would be overwritten. Same lock order as revoke (Church row, then halves).
   */
  private async ensureChurchInvitationPending({
    churchId,
    churchInvitationId,
    tx,
  }: EnsureChurchInvitationPendingInput): Promise<void> {
    const locked = await this.invitationRepository.lockChurchInvitation({
      churchId,
      churchInvitationId,
      tx,
    });
    if (locked?.status !== 'pending') throw new InvitationNotPendingError();
  }

  /** Tags a Better Auth rejection failure so the decline reports it as identity. */
  private async rejectChurchHalf(
    input: RejectChurchInvitationInput,
  ): Promise<void> {
    try {
      await this.identityGateway.rejectChurchInvitation(input);
    } catch (cause) {
      throw new IdentityRejectFailure({ cause });
    }
  }

  private async classifyIdentityFailure({
    email,
  }: ClassifyIdentityFailureInput): Promise<
    'EMAIL_ALREADY_REGISTERED' | 'IDENTITY_FAILED'
  > {
    const registered = await this.identityGateway
      .isEmailRegistered({ email })
      .catch(() => false);
    return registered ? 'EMAIL_ALREADY_REGISTERED' : 'IDENTITY_FAILED';
  }

  private async churchOnlyOutcome({
    sourceChurchId,
    destinationChurchId,
    destinationChurchName,
    ministryInvitationId,
    ministryName,
  }: ChurchOnlyOutcomeInput): Promise<ChurchOnlyRedemptionOutcome> {
    const sourceChurch = await this.churchRepository.getById({
      id: sourceChurchId,
    });
    return {
      kind: 'church-only',
      sourceChurchName: sourceChurch.name,
      destinationChurchId,
      destinationChurchName,
      ministryInvitationId,
      ministryName,
    };
  }

  /**
   * Spec §7.5: Church Membership already committed earlier in the checkpoint
   * sequence; here we record the `church_only_partial_acceptance` audit act
   * (§7.6) and name both Churches so the caller can offer a Volunteer
   * Transfer. Nothing else was written — the Ministry Invitation stays
   * `pending`.
   */
  private async describeChurchOnlySplit({
    error,
    churchId,
    destinationChurchName,
    ministryInvitationId,
    ministryName,
    userId,
    correlationId,
    now,
  }: DescribeChurchOnlySplitInput): Promise<ChurchOnlyRedemptionOutcome> {
    await this.unitOfWork.run((tx) =>
      this.redemptionRepository.recordChurchOnlyPartialAcceptance({
        churchId,
        ministryInvitationId,
        userId,
        correlationId,
        recordedAt: now,
        tx,
      }),
    );
    return this.churchOnlyOutcome({
      sourceChurchId: error.sourceChurchId,
      destinationChurchId: churchId,
      destinationChurchName,
      ministryInvitationId,
      ministryName,
    });
  }

  async acceptPendingMinistryInvitation({
    churchId,
    ministryInvitationId,
    userId,
    acceptedAt,
    correlationId,
    auditAction = 'acceptance',
  }: AcceptPendingMinistryInvitationInput): Promise<VolunteerId> {
    return this.unitOfWork.run((tx) =>
      this.redemptionRepository.acceptPendingMinistryInvitation({
        churchId,
        ministryInvitationId,
        userId,
        acceptedAt,
        correlationId: correlationId ?? crypto.randomUUID(),
        auditAction,
        tx,
      }),
    );
  }

  /**
   * A chained Church offer may carry several Ministry halves; accepting one
   * grants every still-pending sibling in the same transaction, so none is lost.
   */
  private async acceptWithSiblings({
    ministryInvitation,
    userId,
    acceptedAt,
    correlationId,
  }: AcceptWithSiblingsInput): Promise<VolunteerId> {
    return this.unitOfWork.run(async (tx) => {
      const { churchId, churchInvitationId } = ministryInvitation;
      const siblingQuery = churchInvitationId
        ? {
            churchInvitationId,
            exceptMinistryInvitationId: ministryInvitation.id,
            now: acceptedAt,
            tx,
          }
        : null;
      const candidateIds = siblingQuery
        ? await this.invitationRepository.findPendingSiblingMinistryInvitationIds(
            siblingQuery,
          )
        : [];
      // Lock order shared with revoke and archive: every half's Ministry,
      // then the Church Invitation row, then the halves themselves.
      await this.redemptionRepository.lockInvitedMinistries({
        churchId,
        ministryInvitationIds: [
          ministryInvitation.id,
          ...candidateIds,
        ] as MinistryInvitationId[],
        tx,
      });
      let siblingIds = candidateIds;
      if (siblingQuery && churchInvitationId) {
        await this.invitationRepository.lockChurchInvitation({
          churchId,
          churchInvitationId,
          tx,
        });
        // A sibling revoked while this waited is no longer granted.
        const stillPending = new Set(
          await this.invitationRepository.findPendingSiblingMinistryInvitationIds(
            siblingQuery,
          ),
        );
        siblingIds = candidateIds.filter((id) => stillPending.has(id));
      }
      const ids = [
        ministryInvitation.id,
        ...siblingIds,
      ] as MinistryInvitationId[];
      let volunteerId: VolunteerId | null = null;
      for (const id of ids) {
        volunteerId =
          await this.redemptionRepository.acceptPendingMinistryInvitation({
            churchId,
            ministryInvitationId: id,
            userId,
            acceptedAt,
            correlationId,
            auditAction: 'ministry_acceptance',
            tx,
          });
      }
      return volunteerId as VolunteerId;
    });
  }

  /**
   * Shared preamble for every existing-member/lifecycle-branch entry point:
   * resolve the invitation, then the wrong-account check (spec §7.3) — a
   * mismatch is recorded to the security log here, once, so every caller
   * gets it for free rather than re-deriving it.
   */
  private async resolveInvitationContext({
    ministryInvitationId,
    userId,
    now,
    correlationId,
  }: ResolveInvitationContextInput): Promise<ResolvedInvitationContext> {
    const context =
      await this.invitationRepository.findMinistryInvitationContext({
        ministryInvitationId,
      });
    if (!context) return { status: 'unavailable' };
    const addressed =
      await this.invitationRepository.isInvitationAddressedToUser({
        ministryInvitation: context.ministryInvitation,
        userId,
      });
    if (!addressed) {
      await this.securityLogRepository.recordIdentityMismatch({
        churchId: context.ministryInvitation.churchId,
        ministryInvitationId,
        actorId: userId,
        correlationId: correlationId ?? crypto.randomUUID(),
        now,
      });
      return { status: 'identity-mismatch', addressedEmail: context.email };
    }
    if (context.ministryInvitation.status === 'accepted') {
      return {
        status: 'already-accepted',
        ministryInvitation: context.ministryInvitation,
      };
    }
    return { status: 'redeemable', context };
  }

  async getAuthenticatedInvitationStatus({
    ministryInvitationId,
    userId,
    now = nowAsDate(),
  }: GetAuthenticatedInvitationStatusInput): Promise<AuthenticatedInvitationStatus> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable') return { kind: 'unavailable' };
    if (resolved.status === 'identity-mismatch') {
      return {
        kind: 'identity-mismatch',
        maskedEmail: maskEmail({ email: resolved.addressedEmail }),
      };
    }
    if (resolved.status === 'already-accepted') {
      return {
        kind: 'already-accepted',
        churchId: resolved.ministryInvitation.churchId,
      };
    }
    const { ministryInvitation } = resolved.context;
    if (!isInvitationRedeemable({ ministryInvitation, now })) {
      return { kind: 'unavailable' };
    }
    return {
      kind: 'redeemable',
      invitationKind: ministryInvitation.kind,
      email: resolved.context.email,
      churchName: resolved.context.churchName,
      ministryName: resolved.context.ministryName,
      ministryAccessLevel: ministryInvitation.ministryAccessLevel,
      roleNames: resolved.context.roleNames,
      expiresAt: toDate({ instant: ministryInvitation.expiresAt }),
    };
  }

  async acceptExistingMember({
    ministryInvitationId,
    userId,
    sessionCookie,
    idempotencyKey,
    now = nowAsDate(),
  }: AcceptExistingMemberInput): Promise<AcceptExistingMemberOutcome> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
      correlationId: idempotencyKey,
    });
    if (resolved.status === 'unavailable')
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    if (resolved.status === 'identity-mismatch')
      return { kind: 'identity-mismatch' };
    if (resolved.status === 'already-accepted') {
      return {
        kind: 'already-accepted',
        churchId: resolved.ministryInvitation.churchId,
      };
    }
    const { ministryInvitation } = resolved.context;
    if (!isInvitationRedeemable({ ministryInvitation, now })) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    if (
      ministryInvitation.kind === 'chained' &&
      resolved.context.churchInvitationStatus === 'pending'
    ) {
      try {
        await this.unitOfWork.run(async (tx) => {
          const churchInvitationId =
            ministryInvitation.churchInvitationId as ChurchInvitationId;
          await this.ensureChurchInvitationPending({
            churchId: ministryInvitation.churchId,
            churchInvitationId,
            tx,
          });
          await this.identityGateway.acceptChurchInvitation({
            churchInvitationId,
            sessionCookie,
            tx,
          });
          await this.redemptionRepository.recordChurchInvitationAcceptance({
            churchInvitationId,
            userId,
            acceptedAt: now,
            tx,
          });
        });
      } catch (error) {
        if (error instanceof InvitationNotPendingError)
          return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
        return { kind: 'terminal-failure', reason: 'IDENTITY_FAILED' };
      }
    }
    try {
      const volunteerId = await this.acceptWithSiblings({
        ministryInvitation,
        userId,
        acceptedAt: now,
        correlationId: idempotencyKey,
      });
      return { kind: 'full-success', volunteerId };
    } catch (error) {
      if (error instanceof CrossChurchVolunteerConflictError) {
        return this.describeChurchOnlySplit({
          error,
          churchId: ministryInvitation.churchId,
          destinationChurchName: resolved.context.churchName,
          ministryInvitationId,
          ministryName: resolved.context.ministryName,
          userId,
          correlationId: idempotencyKey,
          now,
        });
      }
      return {
        kind: 'retryable-failure',
        reason: 'MINISTRY_ACCEPTANCE_FAILED',
      };
    }
  }

  async declineInvitation({
    ministryInvitationId,
    userId,
    sessionCookie,
    now = nowAsDate(),
  }: DeclineInvitationInput): Promise<DeclineInvitationOutcome> {
    const resolved = await this.resolveInvitationContext({
      ministryInvitationId,
      userId,
      now,
    });
    if (resolved.status === 'unavailable')
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    if (resolved.status === 'identity-mismatch')
      return { kind: 'identity-mismatch' };
    if (resolved.status === 'already-accepted') {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    const { ministryInvitation } = resolved.context;
    if (ministryInvitation.status === 'rejected') return { kind: 'declined' };
    if (!isInvitationRedeemable({ ministryInvitation, now })) {
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    }
    const { churchId, churchInvitationId } = ministryInvitation;
    const rejectsChurchHalf =
      ministryInvitation.kind === 'chained' &&
      resolved.context.churchInvitationStatus === 'pending';
    try {
      await this.unitOfWork.run(async (tx) => {
        if (rejectsChurchHalf) {
          // Better Auth's reject write is unconditional: lock and recheck
          // the Church row first, so a committed revoke is never overwritten.
          await this.ensureChurchInvitationPending({
            churchId,
            churchInvitationId: churchInvitationId as string,
            tx,
          });
          await this.rejectChurchHalf({
            churchInvitationId: churchInvitationId as string,
            sessionCookie,
            tx,
          });
        }
        await this.redemptionRepository.declineMinistryInvitation({
          churchId,
          ministryInvitationId,
          userId,
          declinedAt: now,
          correlationId: crypto.randomUUID(),
          tx,
        });
      });
    } catch (error) {
      if (error instanceof IdentityRejectFailure)
        return { kind: 'terminal-failure', reason: 'IDENTITY_FAILED' };
      if (
        error instanceof InvitationNotPendingError ||
        error instanceof PendingMinistryInvitationNotFoundError
      )
        return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
      throw error;
    }
    return { kind: 'declined' };
  }

  async declineChurchInvitation({
    churchInvitationId,
    now = nowAsDate(),
  }: DeclineChurchInvitationInput): Promise<DeclineChurchInvitationOutcome> {
    const result = await this.unitOfWork.run((tx) =>
      this.redemptionRepository.declineChurchInvitation({
        churchInvitationId,
        declinedAt: now,
        tx,
      }),
    );
    if (result === 'unavailable')
      return { kind: 'terminal-failure', reason: 'INVITATION_UNAVAILABLE' };
    return { kind: 'declined' };
  }

  async getDebugVerificationCode({
    churchInvitationId,
    now = nowAsDate(),
  }: GetDebugVerificationCodeInput): Promise<string | null> {
    if (!this.verificationCodeInspector) return null;
    const preview = await this.getPublicPreview({ churchInvitationId, now });
    if (!preview) return null;
    return (
      this.verificationCodeInspector.lastVerificationCodeFor({
        to: preview.email,
      }) ?? null
    );
  }

  async getDebugInvitationLink({
    email,
  }: GetDebugInvitationLinkInput): Promise<string | null> {
    return (
      this.verificationCodeInspector?.lastInvitationLinkFor({ to: email }) ??
      null
    );
  }
}

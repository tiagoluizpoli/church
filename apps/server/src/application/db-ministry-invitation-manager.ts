import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  type Instant,
  nowAsDate,
  now as nowInstant,
  toDate,
} from '@church/time';
import type { ChurchId, MinistryId, UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  GetMinistryInvitationDeliveryStatusInput,
  IMinistryInvitationManager,
  MinistryInvitationDeliveryStatus,
  MintMinistryInvitationInput,
  ResendMinistryInvitationInput,
} from '../domain/contracts/application/ministry-invitation-manager';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type {
  ChurchInvitationSummary,
  MinistryInvitationRepository,
} from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type { OutboxRepository } from '../domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '../domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { MinistryInvitation } from '../domain/entities/ministry-invitation';
import { InsufficientInvitationAuthorityError } from '../domain/errors/insufficient-invitation-authority';
import { InvalidInvitationRoleError } from '../domain/errors/invalid-invitation-role';
import { InviteeAlreadyMinistryMemberError } from '../domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '../domain/errors/ministry-invitation-not-found';
import { MissingOutboxDeliveryRecordError } from '../domain/errors/missing-outbox-delivery-record';
import { ResendCooldownActiveError } from '../domain/errors/resend-cooldown-active';
import { ResendDailyCapExceededError } from '../domain/errors/resend-daily-cap-exceeded';
import {
  hasResendDailyCapExceeded,
  isResendCooldownActive,
  nextResendThrottleState,
  type ResendThrottleState,
} from '../domain/services/resend-throttle';

interface EnsureMintableScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  callerId: UserId;
}

interface MintableScope {
  callerIsAdmin: boolean;
}

interface MintForExistingMemberInput extends MintMinistryInvitationInput {
  inviteeUserId: UserId;
  tx: TransactionContext;
}

interface MintChainedInput extends MintMinistryInvitationInput {
  tx: TransactionContext;
}

interface ResolveChainedChurchInvitationInput {
  churchId: MintMinistryInvitationInput['churchId'];
  email: string;
  inviterId: UserId;
  tx: TransactionContext;
}

interface EnsureResendAllowedInput {
  throttleState: ResendThrottleState;
  now: Instant;
}

interface DbMinistryInvitationManagerDependencies {
  repo: MinistryInvitationRepository;
  roleRepository: RoleRepository;
  ministryRepository: MinistryRepository;
  authorityManager: IAuthorityManager;
  unitOfWork: UnitOfWork;
  outboxRepository: OutboxRepository;
  config: AppConfig;
}

export class DbMinistryInvitationManager implements IMinistryInvitationManager {
  constructor({
    repo,
    roleRepository,
    ministryRepository,
    authorityManager,
    unitOfWork,
    outboxRepository,
    config,
  }: DbMinistryInvitationManagerDependencies) {
    this.repo = repo;
    this.roleRepository = roleRepository;
    this.ministryRepository = ministryRepository;
    this.authorityManager = authorityManager;
    this.unitOfWork = unitOfWork;
    this.outboxRepository = outboxRepository;
    const { ministryInvitation, invitationResend } = config;
    this.invitationTtlMs = ministryInvitation.ttlMs;
    this.resendPolicy = invitationResend;
  }

  private readonly repo: MinistryInvitationRepository;
  private readonly roleRepository: RoleRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly unitOfWork: UnitOfWork;
  private readonly outboxRepository: OutboxRepository;

  private readonly invitationTtlMs: number;
  private readonly resendPolicy: AppConfig['invitationResend'];

  async mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation> {
    const { churchId, ministryId, inviterId, ministryAccessLevel, roleIds } =
      input;

    const { callerIsAdmin } = await this.ensureMintableScope({
      churchId,
      ministryId,
      callerId: inviterId,
    });

    if (!callerIsAdmin && ministryAccessLevel === 'leader') {
      throw new InsufficientInvitationAuthorityError();
    }

    const ministryRoles = await this.roleRepository.listByMinistry(
      churchId,
      ministryId,
    );
    const validRoleIds = new Set(ministryRoles.map((role) => role.id));
    if (!roleIds.every((roleId) => validRoleIds.has(roleId))) {
      throw new InvalidInvitationRoleError();
    }

    return this.unitOfWork.run(async (tx) => {
      // Serializes concurrent mints for this (Ministry, email) pair so two
      // simultaneous re-invites can't both observe "no pending row" and
      // both attempt `create` — see acquireMintLock's own doc comment.
      await this.repo.acquireMintLock({ ministryId, email: input.email, tx });

      const inviteeUserId = await this.repo.findChurchMemberByEmail({
        churchId,
        email: input.email,
        tx,
      });

      return inviteeUserId
        ? this.mintForExistingMember({ ...input, inviteeUserId, tx })
        : this.mintChained({ ...input, tx });
    });
  }

  async resend(
    input: ResendMinistryInvitationInput,
  ): Promise<MinistryInvitation> {
    const { churchId, ministryId, ministryInvitationId, callerId } = input;

    await this.ensureMintableScope({ churchId, ministryId, callerId });

    return this.unitOfWork.run(async (tx) => {
      // Serializes concurrent resends of the same invitation so two
      // simultaneous calls can't both read the same cooldown/cap state and
      // both pass the check — see acquireResendLock's own doc comment.
      await this.repo.acquireResendLock({ ministryInvitationId, tx });

      const existing = await this.repo.findPendingById({
        churchId,
        ministryId,
        ministryInvitationId,
        tx,
      });
      if (!existing) throw new MinistryInvitationNotFoundError();

      const now = nowInstant();
      const throttleState: ResendThrottleState = {
        lastResendAt: existing.lastResendAt,
        resendCount: existing.resendCount,
        resendWindowStartedAt: existing.resendWindowStartedAt,
      };
      this.ensureResendAllowed({ throttleState, now });

      const expiresAt = addMilliseconds({
        instant: now,
        milliseconds: this.invitationTtlMs,
      });
      const nextThrottle = nextResendThrottleState({
        state: throttleState,
        policy: this.resendPolicy,
        now,
      });
      const invitation = await this.repo.applyResend({
        churchId,
        ministryInvitation: existing,
        expiresAt: toDate({ instant: expiresAt }),
        throttle: {
          lastResendAt: toDate({ instant: nextThrottle.lastResendAt }),
          resendCount: nextThrottle.resendCount,
          resendWindowStartedAt: toDate({
            instant: nextThrottle.resendWindowStartedAt,
          }),
        },
        tx,
      });

      await this.repo.enqueueOutboxMessage({
        churchId,
        kind:
          existing.kind === 'chained'
            ? 'invitation.chained'
            : 'invitation.ministry',
        payload: { ministryInvitationId: invitation.id },
        correlationId: crypto.randomUUID(),
        scheduledFor: nowAsDate(),
        tx,
      });

      return invitation;
    });
  }

  /**
   * Both `mint` and `resend` enqueue exactly one outbox message before
   * returning, so a `null` read here would mean the row that was just
   * committed is missing — an invariant violation, not a valid API state.
   */
  async getDeliveryStatus(
    input: GetMinistryInvitationDeliveryStatusInput,
  ): Promise<MinistryInvitationDeliveryStatus> {
    const { churchId, ministryInvitationId } = input;
    const status =
      await this.outboxRepository.findLatestStatusForMinistryInvitation({
        churchId,
        ministryInvitationId,
      });
    if (status == null) {
      throw new MissingOutboxDeliveryRecordError({ ministryInvitationId });
    }
    // 'processing' is a transient infrastructure detail (the worker is
    // mid-send) — the API's vocabulary treats it the same as 'pending'.
    return status === 'processing' ? 'pending' : status;
  }

  private async mintForExistingMember(
    input: MintForExistingMemberInput,
  ): Promise<MinistryInvitation> {
    const {
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      inviteeUserId,
      roleIds,
      tx,
    } = input;

    const alreadyMember = await this.repo.hasActiveMinistryMembership({
      churchId,
      ministryId,
      userId: inviteeUserId,
      tx,
    });
    if (alreadyMember) throw new InviteeAlreadyMinistryMemberError();

    const existing = await this.repo.findPendingByInvitee({
      churchId,
      ministryId,
      inviteeUserId,
      tx,
    });

    const expiresAtInstant = addMilliseconds({
      instant: nowInstant(),
      milliseconds: this.invitationTtlMs,
    });
    const expiresAt = toDate({ instant: expiresAtInstant });
    const invitation = existing
      ? await this.repo.refreshExpiry({
          churchId,
          ministryInvitation: existing,
          expiresAt,
          tx,
        })
      : await this.repo.create({
          churchId,
          ministryId,
          ministryAccessLevel,
          inviterId,
          inviteeUserId,
          roleIds,
          expiresAt,
          tx,
        });

    await this.repo.enqueueOutboxMessage({
      churchId,
      kind: 'invitation.ministry',
      payload: { ministryInvitationId: invitation.id },
      correlationId: crypto.randomUUID(),
      scheduledFor: nowAsDate(),
      tx,
    });

    return invitation;
  }

  private async mintChained(
    input: MintChainedInput,
  ): Promise<MinistryInvitation> {
    const {
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      email,
      roleIds,
      tx,
    } = input;

    const churchInvitationSummary = await this.resolveChainedChurchInvitation({
      churchId,
      email,
      inviterId,
      tx,
    });

    const existing = await this.repo.findPendingByChurchInvitation({
      churchId,
      ministryId,
      churchInvitationId: churchInvitationSummary.id,
      tx,
    });

    const invitation = existing
      ? await this.repo.refreshExpiry({
          churchId,
          ministryInvitation: existing,
          expiresAt: churchInvitationSummary.expiresAt,
          tx,
        })
      : await this.repo.create({
          churchId,
          ministryId,
          ministryAccessLevel,
          inviterId,
          churchInvitationId: churchInvitationSummary.id,
          roleIds,
          expiresAt: churchInvitationSummary.expiresAt,
          tx,
        });

    await this.repo.enqueueOutboxMessage({
      churchId,
      kind: 'invitation.chained',
      payload: {
        ministryInvitationId: invitation.id,
        churchInvitationId: churchInvitationSummary.id,
      },
      correlationId: crypto.randomUUID(),
      scheduledFor: nowAsDate(),
      tx,
    });

    return invitation;
  }

  private async resolveChainedChurchInvitation(
    input: ResolveChainedChurchInvitationInput,
  ): Promise<ChurchInvitationSummary> {
    const { churchId, email, inviterId, tx } = input;
    const existing = await this.repo.findPendingChurchInvitationByEmail({
      churchId,
      email,
      tx,
    });
    if (existing) return existing;
    return this.repo.createChainedChurchInvitation({
      churchId,
      email,
      inviterId,
      tx,
    });
  }

  /**
   * A nonexistent Ministry, one outside the Active Church, and one the
   * caller has no authority to manage are deliberately indistinguishable —
   * all three throw the same `MinistryInvitationNotFoundError` so nobody can
   * map another congregation's structure by probing.
   */
  private async ensureMintableScope(
    input: EnsureMintableScopeInput,
  ): Promise<MintableScope> {
    const { churchId, ministryId, callerId } = input;

    try {
      await this.ministryRepository.getById(churchId, ministryId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new MinistryInvitationNotFoundError();
      }
      throw error;
    }

    const canManage = await this.authorityManager.canManageMinistry({
      churchId,
      ministryId,
      userId: callerId,
    });
    if (!canManage) throw new MinistryInvitationNotFoundError();

    const callerIsAdmin = await this.authorityManager.canManageChurch({
      churchId,
      userId: callerId,
    });

    return { callerIsAdmin };
  }

  private ensureResendAllowed(input: EnsureResendAllowedInput): void {
    const { throttleState, now } = input;
    if (
      isResendCooldownActive({
        state: throttleState,
        policy: this.resendPolicy,
        now,
      })
    ) {
      throw new ResendCooldownActiveError();
    }
    if (
      hasResendDailyCapExceeded({
        state: throttleState,
        policy: this.resendPolicy,
        now,
      })
    ) {
      throw new ResendDailyCapExceededError();
    }
  }
}

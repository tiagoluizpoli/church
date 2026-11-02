import type { AppConfig } from '@church/app-config';
import { NotFoundError } from '@church/core';
import {
  addMilliseconds,
  compareInstants,
  fromDate,
  type Instant,
  nowAsDate,
  now as nowInstant,
  toDate,
} from '@church/time';
import type { ChurchId, MinistryId, UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type { IChurchNotifications } from '../domain/contracts/application/church-notifications';
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
import { InvitationRoleRequiredError } from '../domain/errors/invitation-role-required';
import { InviteeAlreadyMinistryMemberError } from '../domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '../domain/errors/ministry-invitation-not-found';
import { MissingOutboxDeliveryRecordError } from '../domain/errors/missing-outbox-delivery-record';
import { PendingMinistryInvitationExistsError } from '../domain/errors/pending-ministry-invitation-exists';
import { ResendCooldownActiveError } from '../domain/errors/resend-cooldown-active';
import { ResendDailyCapExceededError } from '../domain/errors/resend-daily-cap-exceeded';
import { normalizeInvitationEmail } from '../domain/services/normalize-invitation-email';
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

interface EnqueueMemberNotificationInput {
  churchId: ChurchId;
  userId: UserId;
  ministryInvitationId: string;
  tx: TransactionContext;
}

interface EnsureResendAllowedInput {
  throttleState: ResendThrottleState;
  now: Instant;
}

interface LockActiveMinistryForMintInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx: TransactionContext;
}

interface DbMinistryInvitationManagerDependencies {
  repo: MinistryInvitationRepository;
  roleRepository: RoleRepository;
  ministryRepository: MinistryRepository;
  authorityManager: IAuthorityManager;
  unitOfWork: UnitOfWork;
  outboxRepository: OutboxRepository;
  notifications: IChurchNotifications;
  config: AppConfig;
}

export class DbMinistryInvitationManager implements IMinistryInvitationManager {
  private readonly repo: MinistryInvitationRepository;
  private readonly roleRepository: RoleRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly unitOfWork: UnitOfWork;
  private readonly outboxRepository: OutboxRepository;
  private readonly notifications: IChurchNotifications;

  private readonly invitationTtlMs: number;
  /** A paired invitation follows its Church half's lifetime. */
  private readonly churchInvitationTtlMs: number;
  private readonly resendPolicy: AppConfig['invitationResend'];

  constructor({
    repo,
    roleRepository,
    ministryRepository,
    authorityManager,
    unitOfWork,
    outboxRepository,
    notifications,
    config,
  }: DbMinistryInvitationManagerDependencies) {
    this.repo = repo;
    this.roleRepository = roleRepository;
    this.ministryRepository = ministryRepository;
    this.authorityManager = authorityManager;
    this.unitOfWork = unitOfWork;
    this.outboxRepository = outboxRepository;
    this.notifications = notifications;
    const { ministryInvitation, churchInvitation, invitationResend } = config;
    this.invitationTtlMs = ministryInvitation.ttlMs;
    this.churchInvitationTtlMs = churchInvitation.ttlMs;
    this.resendPolicy = invitationResend;
  }

  async mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation> {
    const { churchId, ministryId, inviterId, ministryAccessLevel } = input;
    const email = normalizeInvitationEmail({ email: input.email });
    const roleIds = [...new Set(input.roleIds)];

    const { callerIsAdmin } = await this.ensureMintableScope({
      churchId,
      ministryId,
      callerId: inviterId,
    });

    if (!callerIsAdmin && ministryAccessLevel === 'leader') {
      throw new InsufficientInvitationAuthorityError();
    }

    return this.unitOfWork.run(async (tx) => {
      // Lock order shared with the admin invite: Church/address, then
      // Ministry/address, then rows. Every recheck below runs under them.
      await this.repo.acquireChurchOfferLock({ churchId, email, tx });
      await this.repo.acquireMintLock({ ministryId, email, tx });
      await this.lockActiveMinistry({ churchId, ministryId, tx });
      // Leading without serving is valid; serving needs a Role.
      if (ministryAccessLevel === 'volunteer' && roleIds.length === 0) {
        throw new InvitationRoleRequiredError();
      }

      // Only active Roles of this Ministry; share-locked so a concurrent Role
      // archive cannot slip between this check and the invitation write.
      const activeRoles = await this.roleRepository.lockActiveForUse({
        churchId,
        ministryId,
        roleIds,
        tx,
      });
      const validRoleIds = new Set<string>(activeRoles.map((role) => role.id));
      if (!roleIds.every((roleId) => validRoleIds.has(roleId))) {
        throw new InvalidInvitationRoleError();
      }

      const inviteeUserId = await this.repo.findChurchMemberByEmail({
        churchId,
        email,
        tx,
      });
      if (
        inviteeUserId &&
        (await this.repo.hasActiveMinistryMembership({
          churchId,
          ministryId,
          userId: inviteeUserId,
          tx,
        }))
      ) {
        throw new InviteeAlreadyMinistryMemberError();
      }

      // Stored pending is a duplicate even past its expiry; never refreshed here.
      const existing = await this.repo.findPendingForAddress({
        churchId,
        ministryId,
        email,
        tx,
      });
      if (existing) {
        throw new PendingMinistryInvitationExistsError({
          existingInvitation: existing,
        });
      }

      const mintInput = { ...input, email, roleIds, tx };
      return inviteeUserId
        ? this.mintForExistingMember({ ...mintInput, inviteeUserId })
        : this.mintChained(mintInput);
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

      const { churchInvitationId } = existing;
      const expiresAt = addMilliseconds({
        instant: now,
        milliseconds: churchInvitationId
          ? this.churchInvitationTtlMs
          : this.invitationTtlMs,
      });
      // Both halves of a pair restart together, so neither outlives the other.
      if (churchInvitationId) {
        await this.repo.refreshChurchInvitationExpiry({
          churchId,
          churchInvitationId,
          expiresAt: toDate({ instant: expiresAt }),
          tx,
        });
      }
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

      // A resend is a new intended delivery: a new row, never a retry.
      if (invitation.inviteeUserId) {
        await this.enqueueMemberNotification({
          churchId,
          userId: invitation.inviteeUserId,
          ministryInvitationId: invitation.id,
          tx,
        });
      } else {
        await this.repo.enqueueOutboxMessage({
          churchId,
          kind: 'invitation.chained',
          payload: { ministryInvitationId: invitation.id },
          correlationId: crypto.randomUUID(),
          scheduledFor: nowAsDate(),
          tx,
        });
      }

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

    const expiresAt = toDate({
      instant: addMilliseconds({
        instant: nowInstant(),
        milliseconds: this.invitationTtlMs,
      }),
    });
    const invitation = await this.repo.create({
      churchId,
      ministryId,
      ministryAccessLevel,
      inviterId,
      inviteeUserId,
      roleIds,
      expiresAt,
      tx,
    });

    await this.enqueueMemberNotification({
      churchId,
      userId: inviteeUserId,
      ministryInvitationId: invitation.id,
      tx,
    });

    return invitation;
  }

  /** An existing Church Member's invitation is a Notification: email + inbox. */
  private async enqueueMemberNotification({
    churchId,
    userId,
    ministryInvitationId,
    tx,
  }: EnqueueMemberNotificationInput): Promise<void> {
    await this.notifications.enqueue({
      tx,
      kind: 'ministry_invitation',
      to: [{ userId, churchId }],
      data: { ministryInvitationId },
    });
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

    const invitation = await this.repo.create({
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
    if (!existing) {
      return this.repo.createChainedChurchInvitation({
        churchId,
        email,
        inviterId,
        tx,
      });
    }
    const now = nowInstant();
    const expired =
      compareInstants({
        left: fromDate({ date: existing.expiresAt }),
        right: now,
      }) <= 0;
    if (!expired) return existing;
    // An expired pending Church offer is reissued with the new half, the
    // same paired-expiry rule an admin upgrade applies (Spec 15).
    const expiresAt = toDate({
      instant: addMilliseconds({
        instant: now,
        milliseconds: this.churchInvitationTtlMs,
      }),
    });
    await this.repo.alignPairedExpiry({
      churchId,
      churchInvitationId: existing.id,
      expiresAt,
      tx,
    });
    return { id: existing.id, expiresAt };
  }

  /**
   * A nonexistent Ministry, one outside the Active Church, and one the
   * caller has no authority to manage are deliberately indistinguishable —
   * all three throw the same `MinistryInvitationNotFoundError` so nobody can
   * map another congregation's structure by probing.
   */
  /** No new invitation into an archived Ministry, even one archived concurrently. */
  private async lockActiveMinistry({
    churchId,
    ministryId,
    tx,
  }: LockActiveMinistryForMintInput): Promise<void> {
    try {
      await this.ministryRepository.lockActive({
        churchId,
        ministryId,
        strength: 'share',
        tx,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new MinistryInvitationNotFoundError();
      }
      throw error;
    }
  }

  private async ensureMintableScope(
    input: EnsureMintableScopeInput,
  ): Promise<MintableScope> {
    const { churchId, ministryId, callerId } = input;

    try {
      await this.ministryRepository.getById({ churchId, id: ministryId });
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

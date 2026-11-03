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
  AdminInvitation,
  ChurchInvitationResend,
  GetMinistryInvitationDeliveryStatusInput,
  IMinistryInvitationManager,
  MinistryInvitationDeliveryStatus,
  MintAdminInvitationInput,
  MintMinistryInvitationInput,
  ResendChurchInvitationInput,
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
import { InvitationNotPendingError } from '../domain/errors/invitation-not-pending';
import { InvitationRoleRequiredError } from '../domain/errors/invitation-role-required';
import { InviteeAlreadyChurchMemberError } from '../domain/errors/invitee-already-church-member';
import { InviteeAlreadyMinistryMemberError } from '../domain/errors/invitee-already-ministry-member';
import { MinistryInvitationNotFoundError } from '../domain/errors/ministry-invitation-not-found';
import { MissingOutboxDeliveryRecordError } from '../domain/errors/missing-outbox-delivery-record';
import { PendingChurchInvitationExistsError } from '../domain/errors/pending-church-invitation-exists';
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

interface ExpiryFromInput {
  milliseconds: number;
  from?: Instant;
}

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

  /** Validity restarts from `from` (default now) for one lifetime. */
  private expiryFrom({
    milliseconds,
    from = nowInstant(),
  }: ExpiryFromInput): Instant {
    return addMilliseconds({ instant: from, milliseconds });
  }

  async mintAdmin(input: MintAdminInvitationInput): Promise<AdminInvitation> {
    const { churchId, inviterId } = input;
    const email = normalizeInvitationEmail({ email: input.email });

    return this.unitOfWork.run(async (tx) => {
      await this.repo.acquireChurchOfferLock({ churchId, email, tx });
      // Row-locked first: a racing acceptance commits before the member check
      // below, so a completed offer is never upgraded or duplicated.
      const existing = await this.repo.findPendingChurchInvitationByEmail({
        churchId,
        email,
        tx,
      });
      if (await this.repo.findChurchMemberByEmail({ churchId, email, tx })) {
        throw new InviteeAlreadyChurchMemberError();
      }
      // Stored pending admin is a duplicate even past its expiry; never a resend.
      if (existing?.churchAccessLevel === 'admin') {
        throw new PendingChurchInvitationExistsError();
      }

      let churchInvitationId: string;
      let expiresAt: Date;
      if (existing) {
        // A real upgrade is a newly issued offer: Church validity restarts and
        // every pending half aligns to it; resend counters are untouched.
        churchInvitationId = existing.id;
        expiresAt = toDate({
          instant: this.expiryFrom({
            milliseconds: this.churchInvitationTtlMs,
          }),
        });
        await this.repo.upgradeChurchInvitationToAdmin({
          churchId,
          churchInvitationId,
          tx,
        });
        await this.repo.alignPairedExpiry({
          churchId,
          churchInvitationId,
          expiresAt,
          tx,
        });
        await this.repo.supersedeUnsentChainedOutbox({
          churchId,
          churchInvitationId,
          tx,
        });
      } else {
        const created = await this.repo.createChurchInvitation({
          churchId,
          email,
          inviterId,
          churchAccessLevel: 'admin',
          tx,
        });
        churchInvitationId = created.id;
        expiresAt = created.expiresAt;
      }

      // One T1 for the whole offer, admin access plus any retained halves.
      await this.repo.enqueueOutboxMessage({
        churchId,
        kind: 'invitation.church-bootstrap',
        payload: { churchInvitationId },
        correlationId: crypto.randomUUID(),
        scheduledFor: nowAsDate(),
        tx,
      });

      return {
        churchInvitationId,
        expiresAt: fromDate({ date: expiresAt }),
        outcome: existing ? 'upgraded' : 'created',
      };
    });
  }

  async resendChurch(
    input: ResendChurchInvitationInput,
  ): Promise<ChurchInvitationResend | null> {
    const { churchId, churchInvitationId } = input;
    return this.unitOfWork.run(async (tx) => {
      // Lock order: Church Invitation row, then its Ministry Invitation rows.
      const parent = await this.repo.lockChurchInvitation({
        churchId,
        churchInvitationId,
        tx,
      });
      if (!parent) return null;
      if (parent.status !== 'pending') throw new InvitationNotPendingError();

      const now = nowInstant();
      const throttleState: ResendThrottleState = {
        lastResendAt: parent.lastResendAt,
        resendCount: parent.resendCount,
        resendWindowStartedAt: parent.resendWindowStartedAt,
      };
      this.ensureResendAllowed({ throttleState, now });

      const expiresAt = this.expiryFrom({
        from: now,
        milliseconds: this.churchInvitationTtlMs,
      });
      const aligned = await this.repo.alignPairedExpiry({
        churchId,
        churchInvitationId,
        expiresAt: toDate({ instant: expiresAt }),
        tx,
      });
      if (!aligned) throw new InvitationNotPendingError();
      const next = nextResendThrottleState({
        state: throttleState,
        policy: this.resendPolicy,
        now,
      });
      await this.repo.applyChurchResend({
        churchId,
        churchInvitationId,
        throttle: {
          lastResendAt: toDate({ instant: next.lastResendAt }),
          resendCount: next.resendCount,
          resendWindowStartedAt: toDate({
            instant: next.resendWindowStartedAt,
          }),
        },
        tx,
      });
      // One T1 for the whole offer, however many halves it retains.
      await this.repo.enqueueOutboxMessage({
        churchId,
        kind: 'invitation.church-bootstrap',
        payload: { churchInvitationId },
        correlationId: crypto.randomUUID(),
        scheduledFor: nowAsDate(),
        tx,
      });
      return { churchInvitationId, expiresAt };
    });
  }

  async resend(
    input: ResendMinistryInvitationInput,
  ): Promise<MinistryInvitation> {
    const { churchId, ministryId, ministryInvitationId, callerId } = input;

    const { callerIsAdmin } = await this.ensureMintableScope({
      churchId,
      ministryId,
      callerId,
    });

    return this.unitOfWork.run(async (tx) => {
      // Lock order (see `acquireChurchOfferLock`): Ministry, Church Invitation
      // row, then Ministry Invitation rows. Facts are re-read under the locks.
      await this.lockActiveMinistry({ churchId, ministryId, tx });
      // Scope first: Access Level, Ministry and pairing never change, so an
      // unlocked read decides authority without revealing lifecycle facts.
      const target = await this.repo.findById({
        churchId,
        ministryInvitationId,
        tx,
      });
      if (!target || target.ministryId !== ministryId) {
        throw new MinistryInvitationNotFoundError();
      }
      if (!callerIsAdmin && target.ministryAccessLevel === 'leader') {
        throw new InsufficientInvitationAuthorityError();
      }
      const { churchInvitationId } = target;
      if (churchInvitationId) {
        const parent = await this.repo.lockChurchInvitation({
          churchId,
          churchInvitationId,
          tx,
        });
        if (parent?.status !== 'pending') throw new InvitationNotPendingError();
      }
      const existing = await this.repo.lockMinistryInvitation({
        churchId,
        ministryInvitationId,
        tx,
      });
      if (existing?.status !== 'pending') throw new InvitationNotPendingError();

      const now = nowInstant();
      const throttleState: ResendThrottleState = {
        lastResendAt: existing.lastResendAt,
        resendCount: existing.resendCount,
        resendWindowStartedAt: existing.resendWindowStartedAt,
      };
      this.ensureResendAllowed({ throttleState, now });

      const expiresAt = this.expiryFrom({
        from: now,
        milliseconds: churchInvitationId
          ? this.churchInvitationTtlMs
          : this.invitationTtlMs,
      });
      // The parent and every still-pending half restart together, so none
      // outlives another; their own resend counters stay untouched.
      if (churchInvitationId) {
        const aligned = await this.repo.alignPairedExpiry({
          churchId,
          churchInvitationId,
          expiresAt: toDate({ instant: expiresAt }),
          tx,
        });
        if (!aligned) throw new InvitationNotPendingError();
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
      instant: this.expiryFrom({ milliseconds: this.invitationTtlMs }),
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
      return this.repo.createChurchInvitation({
        churchId,
        email,
        inviterId,
        churchAccessLevel: 'member',
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
      instant: this.expiryFrom({
        from: now,
        milliseconds: this.churchInvitationTtlMs,
      }),
    });
    await this.repo.alignPairedExpiry({
      churchId,
      churchInvitationId: existing.id,
      expiresAt,
      tx,
    });
    return { ...existing, expiresAt };
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

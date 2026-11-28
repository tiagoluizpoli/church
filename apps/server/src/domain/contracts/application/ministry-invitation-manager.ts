import type { AppConfig } from '@church/app-config';
import type { Instant } from '@church/time';
import type { AuthorityActor } from '../../authority/types';
import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../../branded-ids';
import type { MinistryInvitation } from '../../entities/ministry-invitation';
import type { MinistryAccessLevel } from '../../entities/ministry-membership';
import type { ResendThrottleState } from '../../services/invitations/resend-throttle.types';
import type { IAuthorityManager } from './authority-manager';
import type { ChurchIdentitySnapshotter } from './church-identity-snapshotter';
import type { IChurchNotifications } from './church-notifications';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import type { OutboxRepository } from '@/domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

/**
 * The minting API's own delivery-status vocabulary (spec #56 §6.4) — kept
 * independent of `OutboxMessageStatus` (an infrastructure contract this
 * application contract may not import) even though the two currently share
 * the same values; `DbMinistryInvitationManager` is the one place that
 * bridges them.
 */
export const MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS = [
  'pending',
  'sent',
  'failed',
] as const;
export type MinistryInvitationDeliveryStatus =
  (typeof MINISTRY_INVITATION_DELIVERY_STATUS_OPTIONS)[number];

export interface MintMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** The caller — resolves both the invitation's `inviterId` and its own authority. */
  inviterId: UserId;
  /** The caller as this request already read it; reused for authority instead of a fresh read. */
  actor?: AuthorityActor;
  email: string;
  ministryAccessLevel: MinistryAccessLevel;
  roleIds: RoleId[];
}

export interface ResendMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  ministryInvitationId: MinistryInvitationId;
  /** The caller — resend requires the same minting authority as creation. */
  callerId: UserId;
  /** The caller as this request already read it; reused for authority instead of a fresh read. */
  actor?: AuthorityActor;
}

export interface GetMinistryInvitationDeliveryStatusInput {
  churchId: ChurchId;
  ministryInvitationId: MinistryInvitationId;
}

export interface MintAdminInvitationInput {
  churchId: ChurchId;
  /** The caller, already admitted as a ChurchAdmin by the authority gatekeeper. */
  inviterId: UserId;
  email: string;
}

/** `upgraded`: an existing pending member offer was raised to admin in place. */
export type AdminInvitationOutcome = 'created' | 'upgraded';

export interface AdminInvitation {
  churchInvitationId: string;
  expiresAt: Instant;
  outcome: AdminInvitationOutcome;
}

export interface RevokeMinistryInvitationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  ministryInvitationId: MinistryInvitationId;
  /** The caller, recorded as the revoking actor; the reason is always `manual`. */
  callerId: UserId;
  /** The caller as this request already read it; reused for authority instead of a fresh read. */
  actor?: AuthorityActor;
}

export interface ResendChurchInvitationInput {
  churchId: ChurchId;
  churchInvitationId: string;
}

export interface RevokeChurchInvitationInput {
  churchId: ChurchId;
  churchInvitationId: string;
  /** The caller, recorded as the revoking actor; the reason is always `manual`. */
  callerId: UserId;
}

export interface ChurchInvitationResend {
  churchInvitationId: string;
  expiresAt: Instant;
}

export interface IMinistryInvitationManager {
  /** Resends a pending or expired admin Church offer; `null` when it is missing or in another Church. */
  resendChurch(
    input: ResendChurchInvitationInput,
  ): Promise<ChurchInvitationResend | null>;
  /** Revokes a pending (or expired) Church offer and every still-pending Ministry half; `false` when it is missing or in another Church. */
  revokeChurch(input: RevokeChurchInvitationInput): Promise<boolean>;
  /** Invites a ChurchAdmin, upgrading a pending member offer while keeping its Ministry halves. */
  mintAdmin(input: MintAdminInvitationInput): Promise<AdminInvitation>;
  mint(input: MintMinistryInvitationInput): Promise<MinistryInvitation>;
  resend(input: ResendMinistryInvitationInput): Promise<MinistryInvitation>;
  /** Revokes a pending (or expired) Ministry Invitation, and its Church Invitation when it was the last pending half. */
  revoke(input: RevokeMinistryInvitationInput): Promise<void>;
  /**
   * The live delivery status of an invitation's most recent outbox message
   * (spec #56 §6.4) — read separately from `mint`/`resend` so both keep
   * returning the bare `MinistryInvitation` they always have.
   */
  getDeliveryStatus(
    input: GetMinistryInvitationDeliveryStatusInput,
  ): Promise<MinistryInvitationDeliveryStatus>;
}

export interface ExpiryFromInput {
  milliseconds: number;
  from?: Instant;
}

export interface EnsureMintableScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  callerId: UserId;
  actor?: AuthorityActor;
}

export interface EnsureOfferAuthorityInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  callerId: UserId;
  actor?: AuthorityActor;
  /** The offer's stored (or, on mint, requested) Ministry Access Level. */
  ministryAccessLevel: MinistryAccessLevel;
  tx?: TransactionContext;
}

export interface MintForExistingMemberInput
  extends MintMinistryInvitationInput {
  inviteeUserId: UserId;
  tx: TransactionContext;
}

export interface MintChainedInput extends MintMinistryInvitationInput {
  tx: TransactionContext;
}

export interface ResolveChainedChurchInvitationInput {
  churchId: MintMinistryInvitationInput['churchId'];
  email: string;
  inviterId: UserId;
  tx: TransactionContext;
}

export interface EnqueueMemberNotificationInput {
  churchId: ChurchId;
  userId: UserId;
  ministryInvitationId: string;
  tx: TransactionContext;
}

export interface EnsureResendAllowedInput {
  throttleState: ResendThrottleState;
  now: Instant;
}

export interface LockActiveMinistryForMintInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx: TransactionContext;
}

export interface DbMinistryInvitationManagerDependencies {
  repo: MinistryInvitationRepository;
  roleRepository: RoleRepository;
  ministryRepository: MinistryRepository;
  authorityManager: IAuthorityManager;
  unitOfWork: UnitOfWork;
  outboxRepository: OutboxRepository;
  notifications: IChurchNotifications;
  churchIdentity: ChurchIdentitySnapshotter;
  config: AppConfig;
}

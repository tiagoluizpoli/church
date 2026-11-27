import type {
  AuthorityAction,
  AuthorityActor,
  AuthorityDecision,
  AuthorityResource,
  AuthorityScope,
  InvitationResource,
  MinistryMembershipOperation,
  MinistryMembershipResource,
} from '../../authority/types';
import type {
  ChurchId,
  EventId,
  EventTimeBlockId,
  MinistryId,
  MinistryParticipationId,
  ShiftId,
  UserId,
} from '../../branded-ids';
import type { AuthorityActorRepository } from '@/domain/contracts/infrastructure/authority-actor.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { SchedulingScopeRepository } from '@/domain/contracts/infrastructure/scheduling-scope.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/**
 * Who asks. `actor` is the caller Active Church resolution already read for
 * this request: it is reused instead of read again whenever it names the same
 * User in the same Church, even beside a `tx`. A check that must re-read the
 * caller's authority under its own locks omits it. Nothing keeps it beyond
 * the request.
 */
export interface AuthorityCaller {
  churchId: ChurchId;
  userId: UserId;
  actor?: AuthorityActor;
}

/** Target facts must come from a Church-scoped repository; null is a missing target. */
export interface DecideAuthorityInput extends AuthorityCaller {
  action: AuthorityAction;
  resource: AuthorityResource | null;
  scope: AuthorityScope;
  /** Reads inside the caller's transaction, so it never needs a second connection. */
  tx?: TransactionContext;
}

export interface CanManageChurchInput extends AuthorityCaller {
  /** Reads the actor's authority inside this transaction (e.g. after a lock); omitted, it reads committed state. */
  tx?: TransactionContext;
}

export interface CanManageMinistryInput extends AuthorityCaller {
  ministryId: MinistryId;
}

/** One stored offer: a Ministry Invitation's Ministry and stored level, or neither for a Church offer. */
export type InvitationAuthorityTarget = Omit<
  InvitationResource,
  'type' | 'churchId'
>;

export interface CanManageInvitationsInput extends AuthorityCaller {
  invitations: InvitationAuthorityTarget[];
  /** Reads inside the caller's transaction, so it never needs a second connection. */
  tx?: TransactionContext;
}

/** One stored Ministry Membership and the operation asked of it. */
export type MinistryMembershipAuthorityTarget = Omit<
  MinistryMembershipResource,
  'type' | 'churchId'
>;

export interface DecideManageMinistryMembershipInput extends AuthorityCaller {
  target: MinistryMembershipAuthorityTarget;
  /** Reads the actor's authority inside this transaction, after its locks. */
  tx?: TransactionContext;
}

/** One stored Ministry Membership, asked about every operation at once. */
export type MinistryMembershipHintTarget = Omit<
  MinistryMembershipAuthorityTarget,
  'operation'
>;

/** Whether the caller may perform each operation on one membership. */
export type MinistryMembershipHints = Record<
  MinistryMembershipOperation,
  boolean
>;

export interface CanManageMinistryMembershipsInput extends AuthorityCaller {
  targets: MinistryMembershipHintTarget[];
}

export interface CanManageParticipationInput extends AuthorityCaller {
  participationId: MinistryParticipationId;
}

export interface CanManageShiftInput extends AuthorityCaller {
  shiftId: ShiftId;
}

export interface CanManageEventInput extends AuthorityCaller {
  eventId: EventId;
}

export interface CanManageEventTimeBlockInput extends AuthorityCaller {
  eventTimeBlockId: EventTimeBlockId;
}

export interface HasSchedulingAccessInput extends AuthorityCaller {}

export interface ListSchedulingChurchIdsInput {
  userId: UserId;
  churchIds: ChurchId[];
}

export interface ResolveCallerCapabilitiesInput extends AuthorityCaller {}

export interface LedMinistryCapability {
  ministryId: MinistryId;
  name: string;
}

/** Navigation data only; protected resources still ask AuthorityService. */
export interface CallerCapabilitiesProjection {
  churchId: ChurchId;
  isChurchAdmin: boolean;
  ledMinistries: LedMinistryCapability[];
  hasVolunteerMembership: boolean;
}

/**
 * Resolves the calling `AuthorityActor` and the Ministry owning a bare
 * resource id (Participation, Shift, Event, EventTimeBlock), then asks
 * `AuthorityService` for a `manage` decision. Supersedes `SchedulingRbacManager`
 * for callers migrated onto AuthorityService.
 */
export interface IAuthorityManager {
  decideAuthority(input: DecideAuthorityInput): Promise<AuthorityDecision>;
  decideManageAnyMinistry(
    input: CanManageChurchInput,
  ): Promise<AuthorityDecision>;
  decideManageMinistry(
    input: CanManageMinistryInput,
  ): Promise<AuthorityDecision>;
  decideManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<AuthorityDecision>;
  decideManageShift(input: CanManageShiftInput): Promise<AuthorityDecision>;
  canManageChurch(input: CanManageChurchInput): Promise<boolean>;
  canManageMinistry(input: CanManageMinistryInput): Promise<boolean>;
  /** Whether the caller may resend or revoke each offer, in input order; one actor read. */
  canManageInvitations(input: CanManageInvitationsInput): Promise<boolean[]>;
  /** The gatekeeper's target-aware Ministry Membership decision for one stored target. */
  decideManageMinistryMembership(
    input: DecideManageMinistryMembershipInput,
  ): Promise<AuthorityDecision>;
  /** Presentation hints from the same rules, one per target in input order; one actor read. */
  canManageMinistryMemberships(
    input: CanManageMinistryMembershipsInput,
  ): Promise<MinistryMembershipHints[]>;
  canManageParticipation(input: CanManageParticipationInput): Promise<boolean>;
  canManageShift(input: CanManageShiftInput): Promise<boolean>;
  canManageEvent(input: CanManageEventInput): Promise<boolean>;
  canManageEventTimeBlock(
    input: CanManageEventTimeBlockInput,
  ): Promise<boolean>;
  resolveCallerCapabilities(
    input: ResolveCallerCapabilitiesInput,
  ): Promise<CallerCapabilitiesProjection>;
  /**
   * Compatibility boolean for server-only callers about one Church. It
   * delegates to the caller-capabilities projection.
   */
  hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean>;
  /**
   * Which of these Churches give the User scheduling access (ChurchAdmin or a
   * led Ministry), at one read however many Churches are asked about.
   */
  listSchedulingChurchIds(
    input: ListSchedulingChurchIdsInput,
  ): Promise<ChurchId[]>;
}

export interface MinistryMembershipHintInput {
  target: MinistryMembershipHintTarget;
  operation: MinistryMembershipOperation;
}

export interface ResolveActorInput extends AuthorityCaller {
  tx?: TransactionContext;
}

export interface DbAuthorityManagerDependencies {
  actorRepository: AuthorityActorRepository;
  scopeRepository: SchedulingScopeRepository;
  eventRepository: EventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  ministryRepository: MinistryRepository;
}

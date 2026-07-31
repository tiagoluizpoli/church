import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryId,
  MinistryInvitationId,
  RoleId,
  UserId,
} from '../branded-ids';
import type { MinistryAccessLevel } from './ministry-volunteer';

export const MINISTRY_INVITATION_STATUS_OPTIONS = [
  'pending',
  'accepted',
  'rejected',
  'canceled',
] as const;
export type MinistryInvitationStatus =
  (typeof MINISTRY_INVITATION_STATUS_OPTIONS)[number];

export interface MinistryInvitationProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  /** An existing Church Member. Exactly one of this and `churchInvitationId` is set. */
  inviteeUserId?: UserId;
  /** The chained Better Auth Church Invitation, for a recipient outside the Church. */
  churchInvitationId?: string;
  ministryAccessLevel: MinistryAccessLevel;
  status: MinistryInvitationStatus;
  inviterId: UserId;
  expiresAt: Date;
  /** Roles the invitee is invited to fill. Never authorization — a qualification. */
  roleIds: RoleId[];
}

/**
 * Targeted, never a bearer link: exactly one of `inviteeUserId` /
 * `churchInvitationId` is set, enforced by a database constraint rather than
 * here. There is deliberately no "expired" status — `isExpired` evaluates
 * lazily against a caller-supplied `now`, matching Better Auth rather than
 * diverging from it.
 */
export class MinistryInvitation extends Entity<
  MinistryInvitationProps,
  MinistryInvitationId
> {
  constructor(
    props: LooseProps<MinistryInvitationProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      props as MinistryInvitationProps,
      id as MinistryInvitationId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get inviteeUserId(): UserId | undefined {
    return this._props.inviteeUserId;
  }

  get churchInvitationId(): string | undefined {
    return this._props.churchInvitationId;
  }

  get ministryAccessLevel(): MinistryAccessLevel {
    return this._props.ministryAccessLevel;
  }

  get status(): MinistryInvitationStatus {
    return this._props.status;
  }

  get inviterId(): UserId {
    return this._props.inviterId;
  }

  get expiresAt(): Date {
    return this._props.expiresAt;
  }

  get roleIds(): RoleId[] {
    return this._props.roleIds;
  }

  /** Never a bearer link: a chained invitation has no invitee of its own yet. */
  get kind(): 'ministry-only' | 'chained' {
    return this._props.churchInvitationId ? 'chained' : 'ministry-only';
  }

  isExpired(now: Date): boolean {
    return this._props.status === 'pending' && now > this._props.expiresAt;
  }
}

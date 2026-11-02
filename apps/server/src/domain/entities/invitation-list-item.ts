import type { MinistryId } from '../branded-ids';
import type { MinistryAccessLevel } from './ministry-membership';

/** Row identity is the pair `(kind, id)`: a Ministry offer and a Church grant never share one. */
export const INVITATION_LIST_KIND_OPTIONS = ['church', 'ministry'] as const;
export type InvitationListKind = (typeof INVITATION_LIST_KIND_OPTIONS)[number];

/** `unavailable` is honest absence — no email attempt, or no proof one was sent. */
export const INVITATION_EMAIL_STATE_OPTIONS = [
  'pending',
  'sent',
  'failed',
  'unavailable',
] as const;
export type InvitationEmailState =
  (typeof INVITATION_EMAIL_STATE_OPTIONS)[number];

export interface InvitationEmailDelivery {
  state: InvitationEmailState;
  /** Only when the sender confirmed the email; never inferred. */
  sentAt?: Date;
}

export interface InvitationListRole {
  id: string;
  name: string;
}

/** The filterable lifecycle words; `expired` is derived (stored pending past its expiry), never persisted. */
export const INVITATION_LIST_STATUS_OPTIONS = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
] as const;
export type InvitationListStatus =
  (typeof INVITATION_LIST_STATUS_OPTIONS)[number];

/** Which grant a row carries: a Church-wide admin grant, or a Ministry leader/Volunteer offer. */
export const INVITATION_INVITED_AS_OPTIONS = [
  'admin',
  'leader',
  'volunteer',
] as const;
export type InvitationInvitedAs =
  (typeof INVITATION_INVITED_AS_OPTIONS)[number];

export interface InvitationListFilters {
  status: InvitationListStatus;
  ministryId?: string;
  invitedAs?: InvitationInvitedAs;
  /** Case-insensitive substring of the addressed email. */
  email?: string;
}

/** Facts about how a closed offer ended; every field is present only when actually recorded. */
export interface InvitationClosure {
  actor?: { id: string; name: string };
  at?: Date;
  reason?: string;
}

/** The pickers the caller may use: only what their authority reaches. */
export interface InvitationListOptions {
  ministries: { id: string; name: string }[];
  invitedAs: InvitationInvitedAs[];
}

/** A stored-pending offer past its expiry still has `status` pending; only `displayStatus` says expired. */
export interface InvitationListItem {
  kind: InvitationListKind;
  id: string;
  /** The Church Invitation a Ministry offer is paired with, or the Church grant itself. */
  churchInvitationId?: string;
  ministryId?: string;
  ministryName?: string;
  email: string;
  /** Church-wide grant of a Church row, or of the parent of a paired Ministry row. */
  churchAccessLevel?: 'admin';
  ministryAccessLevel?: MinistryAccessLevel;
  roles: InvitationListRole[];
  invitedBy: { id: string; name: string };
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  displayStatus: InvitationListStatus;
  closure?: InvitationClosure;
  emailDelivery: InvitationEmailDelivery;
}

export interface InvitationListPage {
  items: InvitationListItem[];
  nextCursor?: string;
  options: InvitationListOptions;
}

/** What the caller may see; decided by the application, enforced in the query itself. */
export type InvitationListScope =
  | { kind: 'church' }
  | { kind: 'ministries'; ministryIds: MinistryId[] };

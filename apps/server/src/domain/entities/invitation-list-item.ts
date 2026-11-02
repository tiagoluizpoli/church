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
  status: 'pending';
  displayStatus: 'pending' | 'expired';
  emailDelivery: InvitationEmailDelivery;
}

export interface InvitationListPage {
  items: InvitationListItem[];
  nextCursor?: string;
}

/** What the caller may see; decided by the application, enforced in the query itself. */
export type InvitationListScope =
  | { kind: 'church' }
  | { kind: 'ministries'; ministryIds: MinistryId[] };

import type { lt, SQL } from 'drizzle-orm';
import type {
  InvitationEmailDelivery,
  InvitationListFilters,
  InvitationListKind,
  InvitationListScope,
} from '../../domain/entities/invitation-list-item';
import type { InvitationListCursorPosition } from '../../domain/invitation-list-cursor';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface DrizzleInvitationListRepositoryInput {
  db: AnyDrizzleDb;
}

export interface KindQueryInput {
  churchId: string;
  limit: number;
  position?: InvitationListCursorPosition;
  filters: InvitationListFilters;
  now: Date;
}

export interface MinistryQueryInput extends KindQueryInput {
  ministryIds?: string[];
}

export interface DeliveryFacts {
  latest: Map<string, InvitationEmailDelivery>;
  lastSent: Map<string, Date>;
}

export interface DeliveryLookupInput {
  churchId: string;
  ministryInvitationIds: string[];
  churchInvitationIds: string[];
  /** Ministry row id → its paired Church Invitation, whose T1 may deliver it. */
  pairedParents: Map<string, string>;
}

export interface FilterOptionsInput {
  churchId: string;
  scope: InvitationListScope;
}

export interface CountScopeInput extends FilterOptionsInput {
  now: Date;
}

export interface TallyInput {
  status: SQL;
  expiresAt: SQL;
  /** Extra condition an offer must meet to count as pending or expired. */
  outstanding?: SQL;
}

export interface ClosuresInput {
  churchId: string;
  rows: { kind: InvitationListKind; id: string; closureFacts: ClosureFacts }[];
}

export type ChurchStatus = 'pending' | 'accepted' | 'rejected' | 'canceled';

/** What the row itself recorded about its closure; the audit trail adds the Ministry-side actor. */
export interface ClosureFacts {
  status: ChurchStatus;
  at?: Date;
  actorId?: string;
  reason?: string;
}

export interface RowOrderKey {
  createdAt: Date;
  kind: InvitationListKind;
  id: string;
}

export interface IsBeforeInput {
  a: RowOrderKey;
  b: RowOrderKey;
}

export interface AfterCursorInput {
  kind: InvitationListKind;
  position?: InvitationListCursorPosition;
  createdAt: Parameters<typeof lt>[0];
  id: Parameters<typeof lt>[0];
}

export interface RolesByInvitationInput {
  ids: string[];
}

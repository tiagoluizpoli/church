import type { ChurchId, UserId } from '../../branded-ids';
import type {
  InvitationListFilters,
  InvitationListPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';

export interface ListInvitationsRequest {
  churchId: ChurchId;
  /** The caller, whose authority decides each row's action facts. */
  userId: UserId;
  /** Resolved by the controller from the caller's capabilities; never from the request. */
  scope: InvitationListScope;
  filters: InvitationListFilters;
  cursor?: string;
  limit?: number;
}

export interface IInvitationListManager {
  list(input: ListInvitationsRequest): Promise<InvitationListPage>;
}

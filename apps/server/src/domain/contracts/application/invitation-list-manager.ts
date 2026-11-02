import type { ChurchId } from '../../branded-ids';
import type {
  InvitationListFilters,
  InvitationListPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';

export interface ListInvitationsRequest {
  churchId: ChurchId;
  /** Resolved by the controller from the caller's capabilities; never from the request. */
  scope: InvitationListScope;
  filters: InvitationListFilters;
  cursor?: string;
  limit?: number;
}

export interface IInvitationListManager {
  list(input: ListInvitationsRequest): Promise<InvitationListPage>;
}

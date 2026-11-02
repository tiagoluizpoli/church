import type { ChurchId } from '../../branded-ids';
import type {
  InvitationListPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';

export interface ListPendingInvitationsRequest {
  churchId: ChurchId;
  /** Resolved by the controller from the caller's capabilities; never from the request. */
  scope: InvitationListScope;
  cursor?: string;
  limit?: number;
}

export interface IInvitationListManager {
  listPending(
    input: ListPendingInvitationsRequest,
  ): Promise<InvitationListPage>;
}

import type { ChurchId } from '../../branded-ids';
import type {
  InvitationListPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';

export interface ListPendingInvitationsInput {
  churchId: ChurchId;
  scope: InvitationListScope;
  cursor?: string;
  limit: number;
  now: Date;
}

export interface InvitationListRepository {
  /** Stored-pending offers (expired included), newest-created first with a kind/id tie-break. */
  listPending(input: ListPendingInvitationsInput): Promise<InvitationListPage>;
}

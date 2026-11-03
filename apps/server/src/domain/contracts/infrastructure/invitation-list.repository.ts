import type { ChurchId } from '../../branded-ids';
import type {
  InvitationListFilters,
  InvitationListRowsPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';

export interface ListInvitationsInput {
  churchId: ChurchId;
  scope: InvitationListScope;
  filters: InvitationListFilters;
  cursor?: string;
  limit: number;
  now: Date;
}

export interface InvitationListRepository {
  /** Offers matching the filters within the scope, newest-created first with a kind/id tie-break. Throws MinistryInvitationNotFoundError for a Ministry filter outside the scope. */
  list(input: ListInvitationsInput): Promise<InvitationListRowsPage>;
}

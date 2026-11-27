import type { ChurchId, UserId } from '../../branded-ids';
import type {
  InvitationListFilters,
  InvitationListPage,
  InvitationListScope,
} from '../../entities/invitation-list-item';
import type { IAuthorityManager } from './authority-manager';
import type { InvitationListRepository } from '@/domain/contracts/infrastructure/invitation-list.repository';

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

export interface DbInvitationListManagerDependencies {
  invitationListRepository: InvitationListRepository;
  authorityManager: IAuthorityManager;
  /** Page size when the caller names none (validated central config). */
  defaultPageSize: number;
}

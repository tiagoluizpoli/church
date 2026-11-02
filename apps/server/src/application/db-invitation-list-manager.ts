import { nowAsDate } from '@church/time';
import type {
  IInvitationListManager,
  ListInvitationsRequest,
} from '../domain/contracts/application/invitation-list-manager';
import type { InvitationListRepository } from '../domain/contracts/infrastructure/invitation-list.repository';
import type { InvitationListPage } from '../domain/entities/invitation-list-item';

interface DbInvitationListManagerDependencies {
  invitationListRepository: InvitationListRepository;
  /** Page size when the caller names none (validated central config). */
  defaultPageSize: number;
}

export class DbInvitationListManager implements IInvitationListManager {
  private readonly invitationListRepository: InvitationListRepository;
  private readonly defaultPageSize: number;

  constructor({
    invitationListRepository,
    defaultPageSize,
  }: DbInvitationListManagerDependencies) {
    this.invitationListRepository = invitationListRepository;
    this.defaultPageSize = defaultPageSize;
  }

  list({
    churchId,
    scope,
    filters,
    cursor,
    limit,
  }: ListInvitationsRequest): Promise<InvitationListPage> {
    return this.invitationListRepository.list({
      churchId,
      scope,
      filters,
      cursor,
      limit: limit ?? this.defaultPageSize,
      now: nowAsDate(),
    });
  }
}

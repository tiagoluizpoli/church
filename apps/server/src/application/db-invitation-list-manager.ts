import { nowAsDate } from '@church/time';
import type { MinistryId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  IInvitationListManager,
  ListInvitationsRequest,
} from '../domain/contracts/application/invitation-list-manager';
import type { InvitationListRepository } from '../domain/contracts/infrastructure/invitation-list.repository';
import type { InvitationListPage } from '../domain/entities/invitation-list-item';

interface DbInvitationListManagerDependencies {
  invitationListRepository: InvitationListRepository;
  authorityManager: IAuthorityManager;
  /** Page size when the caller names none (validated central config). */
  defaultPageSize: number;
}

export class DbInvitationListManager implements IInvitationListManager {
  private readonly invitationListRepository: InvitationListRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly defaultPageSize: number;

  constructor({
    invitationListRepository,
    authorityManager,
    defaultPageSize,
  }: DbInvitationListManagerDependencies) {
    this.invitationListRepository = invitationListRepository;
    this.authorityManager = authorityManager;
    this.defaultPageSize = defaultPageSize;
  }

  async list({
    churchId,
    userId,
    scope,
    filters,
    cursor,
    limit,
  }: ListInvitationsRequest): Promise<InvitationListPage> {
    const page = await this.invitationListRepository.list({
      churchId,
      scope,
      filters,
      cursor,
      limit: limit ?? this.defaultPageSize,
      now: nowAsDate(),
    });
    // Church rows carry no Ministry, so only an admin may manage them.
    const invitations = page.items.map(
      ({ kind, ministryId, ministryAccessLevel }) =>
        kind === 'ministry'
          ? { ministryId: ministryId as MinistryId, ministryAccessLevel }
          : {},
    );
    const manageable = await this.authorityManager.canManageInvitations({
      churchId,
      userId,
      invitations,
    });
    return {
      ...page,
      items: page.items.map(({ parentPending, ...row }, index) => {
        const actionable =
          row.status === 'pending' && manageable[index] === true;
        return {
          ...row,
          canResend: actionable && parentPending,
          canRevoke: actionable,
        };
      }),
    };
  }
}

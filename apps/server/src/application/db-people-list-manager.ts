import type { AppConfig } from '@church/app-config';
import { MinistryId, UserId } from '../domain/branded-ids';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  GetPersonRequest,
  IPeopleListManager,
  ListPeopleRequest,
  PersonDetailResult,
} from '../domain/contracts/application/people-list-manager';
import type { PeopleListRepository } from '../domain/contracts/infrastructure/people-list.repository';
import type { PeopleListPage } from '../domain/entities/people-list-item';

interface DbPeopleListManagerDependencies {
  peopleListRepository: PeopleListRepository;
  authorityManager: IAuthorityManager;
  config: Pick<AppConfig, 'people'>;
}

export class DbPeopleListManager implements IPeopleListManager {
  private readonly peopleListRepository: PeopleListRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly defaultPageSize: number;

  constructor({
    peopleListRepository,
    authorityManager,
    config,
  }: DbPeopleListManagerDependencies) {
    this.peopleListRepository = peopleListRepository;
    this.authorityManager = authorityManager;
    this.defaultPageSize = config.people.pageSize;
  }

  async get(
    request: GetPersonRequest,
  ): Promise<PersonDetailResult | undefined> {
    const record = await this.peopleListRepository.get(request);
    if (!record) return undefined;
    const { userId, ...person } = record;
    // Presentation hints only, from the same gatekeeper rules the mutations use.
    const canEditRoles =
      await this.authorityManager.canManageMinistryMemberships({
        churchId: request.churchId,
        userId: request.callerId,
        targets: person.ministries.map((card) => ({
          ministryId: MinistryId.from(card.ministryId),
          subjectUserId: UserId.from(userId),
          ministryAccessLevel: card.ministryAccessLevel,
          operation: 'editRoles',
        })),
      });
    return {
      person: {
        ...person,
        ministries: person.ministries.map((card, index) => ({
          ...card,
          canEditRoles: canEditRoles[index] ?? false,
        })),
      },
      canChangeChurchAccess: request.scope.kind === 'church',
      canInviteToMinistry: true,
    };
  }

  list({ limit, ...request }: ListPeopleRequest): Promise<PeopleListPage> {
    return this.peopleListRepository.list({
      ...request,
      limit: limit ?? this.defaultPageSize,
    });
  }
}

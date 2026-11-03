import type { AppConfig } from '@church/app-config';
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
  config: Pick<AppConfig, 'people'>;
}

export class DbPeopleListManager implements IPeopleListManager {
  private readonly peopleListRepository: PeopleListRepository;
  private readonly defaultPageSize: number;

  constructor({
    peopleListRepository,
    config,
  }: DbPeopleListManagerDependencies) {
    this.peopleListRepository = peopleListRepository;
    this.defaultPageSize = config.people.pageSize;
  }

  async get(
    request: GetPersonRequest,
  ): Promise<PersonDetailResult | undefined> {
    const person = await this.peopleListRepository.get(request);
    if (!person) return undefined;
    // Presentation hints only; the later mutations authorize on their own.
    return {
      person,
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

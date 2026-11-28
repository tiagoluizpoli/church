import type { AppConfig } from '@church/app-config';
import type { AuthorityActor } from '../../authority/types';
import type { ChurchId, UserId } from '../../branded-ids';
import type {
  PeopleListFilters,
  PeopleListPage,
  PeopleListScope,
  PersonDetailView,
} from '../../entities/people-list-item';
import type { IAuthorityManager } from './authority-manager';
import type { PeopleListRepository } from '@/domain/contracts/infrastructure/people-list.repository';

export interface ListPeopleRequest {
  churchId: ChurchId;
  /** Resolved by the controller from the caller's capabilities; never from the request. */
  scope: PeopleListScope;
  filters: PeopleListFilters;
  cursor?: string;
  limit?: number;
}

export interface GetPersonRequest {
  churchId: ChurchId;
  scope: PeopleListScope;
  memberId: string;
  callerId: UserId;
  /** The caller as this request already read it; reused for the hints instead of a fresh read. */
  callerActor?: AuthorityActor;
}

export interface PersonDetailResult {
  person: PersonDetailView;
  canChangeChurchAccess: boolean;
  canInviteToMinistry: boolean;
}

export interface IPeopleListManager {
  get(input: GetPersonRequest): Promise<PersonDetailResult | undefined>;
  list(input: ListPeopleRequest): Promise<PeopleListPage>;
}

export interface DbPeopleListManagerDependencies {
  peopleListRepository: PeopleListRepository;
  authorityManager: IAuthorityManager;
  config: Pick<AppConfig, 'people'>;
}

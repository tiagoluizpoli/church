import type { ChurchId, UserId } from '../../branded-ids';
import type {
  PeopleListFilters,
  PeopleListPage,
  PeopleListScope,
  PersonDetail,
} from '../../entities/people-list-item';

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
}

export interface PersonDetailResult {
  person: PersonDetail;
  canChangeChurchAccess: boolean;
  canInviteToMinistry: boolean;
}

export interface IPeopleListManager {
  get(input: GetPersonRequest): Promise<PersonDetailResult | undefined>;
  list(input: ListPeopleRequest): Promise<PeopleListPage>;
}

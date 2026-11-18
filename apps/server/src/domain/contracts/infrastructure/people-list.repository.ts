import type { ChurchId, UserId } from '../../branded-ids';
import type {
  PeopleListFilters,
  PeopleListPage,
  PeopleListScope,
  PersonDetailRecord,
} from '../../entities/people-list-item';

export interface ListPeopleInput {
  churchId: ChurchId;
  scope: PeopleListScope;
  filters: PeopleListFilters;
  cursor?: string;
  limit: number;
}

export interface GetPersonInput {
  churchId: ChurchId;
  scope: PeopleListScope;
  memberId: string;
  callerId: UserId;
}

export interface PeopleListRepository {
  /** One member within the scope, or undefined when missing, foreign or (for a leader) out of scope. */
  get(input: GetPersonInput): Promise<PersonDetailRecord | undefined>;
  /** Church Members within the scope ordered by name then member id. Throws MinistryInvitationNotFoundError for a Ministry filter outside the scope. */
  list(input: ListPeopleInput): Promise<PeopleListPage>;
}

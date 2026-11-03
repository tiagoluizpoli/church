import type { ChurchId } from '../../branded-ids';
import type {
  PeopleListFilters,
  PeopleListPage,
  PeopleListScope,
} from '../../entities/people-list-item';

export interface ListPeopleInput {
  churchId: ChurchId;
  scope: PeopleListScope;
  filters: PeopleListFilters;
  cursor?: string;
  limit: number;
}

export interface PeopleListRepository {
  /** Church Members within the scope ordered by name then member id. Throws MinistryInvitationNotFoundError for a Ministry filter outside the scope. */
  list(input: ListPeopleInput): Promise<PeopleListPage>;
}

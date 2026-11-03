import type { ChurchId } from '../../branded-ids';
import type {
  PeopleListFilters,
  PeopleListPage,
  PeopleListScope,
} from '../../entities/people-list-item';

export interface ListPeopleRequest {
  churchId: ChurchId;
  /** Resolved by the controller from the caller's capabilities; never from the request. */
  scope: PeopleListScope;
  filters: PeopleListFilters;
  cursor?: string;
  limit?: number;
}

export interface IPeopleListManager {
  list(input: ListPeopleRequest): Promise<PeopleListPage>;
}

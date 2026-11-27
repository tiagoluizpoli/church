import type {
  PeopleListFilters,
  PeopleListScope,
} from '../../domain/entities/people-list-item';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface DrizzlePeopleListRepositoryInput {
  db: AnyDrizzleDb;
}

export interface VisibleScopeInput {
  churchId: string;
  scope: PeopleListScope;
}

export interface VisibleMembershipInput extends VisibleScopeInput {
  /** Narrows to one visible Ministry and/or Ministry Access Level on the same membership. */
  ministryId?: string;
  level?: 'leader' | 'volunteer';
}

export interface MemberFilterInput {
  churchId: string;
  scope: PeopleListScope;
  filters: PeopleListFilters;
}

export interface MinistriesOfInput {
  churchId: string;
  scope: PeopleListScope;
  userIds: string[];
}

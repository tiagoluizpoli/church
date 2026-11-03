import type { MinistryId, UserId } from '../branded-ids';
import type { MinistryAccessLevel } from './ministry-membership';

/** The one optional capacity filter; capacities overlap, Admin is Church-wide. */
export const PEOPLE_ACCESS_OPTIONS = ['admin', 'leader', 'volunteer'] as const;
export type PeopleAccess = (typeof PEOPLE_ACCESS_OPTIONS)[number];

export interface PeopleListFilters {
  /** Trimmed case-insensitive literal substring of name or email. */
  search?: string;
  ministryId?: string;
  access?: PeopleAccess;
}

/** What the caller may see; decided by the application, enforced in the query itself. */
export type PeopleListScope =
  | { kind: 'church' }
  | { kind: 'ministries'; ministryIds: MinistryId[] };

export interface PeopleListMinistry {
  id: string;
  name: string;
  ministryAccessLevel: MinistryAccessLevel;
}

/** One Church Membership; `id` is the opaque Better Auth member id. */
export interface PeopleListItem {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  /** Only Ministries inside the caller's scope. */
  ministries: PeopleListMinistry[];
}

export interface PeopleListPage {
  items: PeopleListItem[];
  nextCursor?: string;
  options: { ministries: { id: string; name: string }[] };
}

export interface PersonDetailRole {
  id: string;
  name: string;
  archived: boolean;
}

/** One active Ministry Membership inside the caller's scope. */
export interface PersonDetailMinistry {
  membershipId: string;
  ministryId: string;
  ministryName: string;
  ministryAccessLevel: MinistryAccessLevel;
  roles: PersonDetailRole[];
}

/** The member's Church access as a ChurchAdmin sees it. */
export interface PersonChurchAccess {
  accessLevel: 'member' | 'admin';
  isLastAdmin: boolean;
  /** The member is the caller: a demotion here removes the caller's own administration. */
  isSelf: boolean;
}

export interface PersonDetail {
  id: string;
  name: string;
  email: string;
  ministries: PersonDetailMinistry[];
  /** Admin scope only; omitted for leaders. */
  churchAccess?: PersonChurchAccess;
}

/** The stored detail with the member's User id, which the gatekeeper hints need and the response omits. */
export interface PersonDetailRecord extends PersonDetail {
  userId: UserId;
}

/** A card with its gatekeeper-derived action hints. */
export interface PersonDetailCard extends PersonDetailMinistry {
  canEditRoles: boolean;
  canEndMembership: boolean;
  canChangeMinistryAccess: boolean;
}

export interface PersonDetailView extends Omit<PersonDetail, 'ministries'> {
  ministries: PersonDetailCard[];
}

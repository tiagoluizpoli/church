import type { ChurchId, UserId, VolunteerId } from '../../domain/branded-ids';
import type { AnyDrizzleDb } from '../repositories/types';

export interface ChurchScopedLookupInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  userId: UserId;
}

export interface ResolveMembershipFactsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: VolunteerId;
}

export interface MembershipRoleRow {
  membershipId: string;
  roleId: string;
}

export interface DrizzleAuthorityActorResolverInput {
  db: AnyDrizzleDb;
}

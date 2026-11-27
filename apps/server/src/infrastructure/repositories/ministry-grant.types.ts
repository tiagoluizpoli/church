import type { AnyDrizzleDb } from './drizzle-db.types';

export interface InsertMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryId: string;
  volunteerId: string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

export interface GrantMinistryMembershipRolesInput {
  db: AnyDrizzleDb;
  churchId: string;
  ministryMembershipId: string;
  roleIds: string[];
}

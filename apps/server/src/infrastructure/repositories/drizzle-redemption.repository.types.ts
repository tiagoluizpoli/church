import type { ChurchId, MinistryId } from '../../domain/branded-ids';
import type { AcceptMinistryInvitationInput } from '../../domain/contracts/infrastructure/redemption.repository';
import type { VolunteerRepository } from '../../domain/contracts/infrastructure/volunteer.repository';
import type { AnyDrizzleDb } from './drizzle-db.types';

export interface PersistedInvitationGrant {
  ministryAccessLevel: 'leader' | 'volunteer';
  ministryId: string;
}

export interface PendingInvitationRole {
  roleId: string;
}

export interface ExistingMinistryMembership {
  id: string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

export interface DrizzleRedemptionRepositoryInput {
  db: AnyDrizzleDb;
  volunteerRepository: VolunteerRepository;
}

export interface AssertInvitationGrantScopeInput {
  db: AnyDrizzleDb;
  churchId: AcceptMinistryInvitationInput['churchId'];
  ministryId: string;
  invitationRoles: PendingInvitationRole[];
}

export interface InsertVolunteerInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  userId: AcceptMinistryInvitationInput['userId'];
}

export interface FindExistingMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
}

export interface TopUpMinistryMembershipInput {
  db: AnyDrizzleDb;
  existingMembership: ExistingMinistryMembership;
  grantedAccessLevel: 'leader' | 'volunteer';
}

export interface InsertMinistryMembershipInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  volunteerId: string;
  ministryId: MinistryId | string;
  ministryAccessLevel: 'leader' | 'volunteer';
}

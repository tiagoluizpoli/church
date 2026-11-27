import type { ChurchId } from '@/domain/branded-ids';
import type { ExecuteVolunteerTransferInput } from '@/domain/contracts/infrastructure/volunteer-transfer.repository';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleVolunteerTransferRepositoryInput {
  db: AnyDrizzleDb;
}

export interface ListActiveLeaderUserIdsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
  ministryId: string;
}

export interface ListChurchAdminUserIdsInput {
  db: AnyDrizzleDb;
  churchId: ChurchId;
}

export interface VolunteerTransferRow {
  id: string;
  sourceVolunteerId: string;
  destinationVolunteerId: string;
  withdrawnAssignmentCount: number;
  endedMembershipCount: number;
}

export interface FindExistingTransferInput {
  db: AnyDrizzleDb;
  userId: ExecuteVolunteerTransferInput['userId'];
  ministryInvitationId: ExecuteVolunteerTransferInput['ministryInvitationId'];
}

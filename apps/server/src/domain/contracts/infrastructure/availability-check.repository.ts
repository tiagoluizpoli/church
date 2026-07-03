import type {
  ChurchId,
  MinistryId,
  PlanningCycleId,
  VolunteerId,
} from '../../branded-ids';
import type { AvailabilityCheck } from '../../entities/availability-check';
import type { TransactionContext } from './transaction-context';

export interface ListActiveMembershipsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface ActiveMinistryMembership {
  ministryVolunteerId: string;
  volunteerId: VolunteerId;
}

export interface ListChecksByCycleInput {
  churchId: ChurchId;
  planningCycleId: PlanningCycleId;
  ministryVolunteerIds?: string[];
  tx?: TransactionContext;
}

export interface NewAvailabilityCheckInput {
  planningCycleId: PlanningCycleId;
  ministryVolunteerId: string;
}

export interface CreateChecksInput {
  churchId: ChurchId;
  checks: NewAvailabilityCheckInput[];
  tx?: TransactionContext;
}

export interface AvailabilityCheckRepository {
  listActiveMemberships(
    input: ListActiveMembershipsInput,
  ): Promise<ActiveMinistryMembership[]>;
  listByCycle(input: ListChecksByCycleInput): Promise<AvailabilityCheck[]>;
  createMany(input: CreateChecksInput): Promise<AvailabilityCheck[]>;
}

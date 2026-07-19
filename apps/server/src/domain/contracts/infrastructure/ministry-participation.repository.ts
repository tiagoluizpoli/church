import type {
  ChurchId,
  EventId,
  MinistryId,
  MinistryParticipationId,
  TimeSlotId,
} from '../../branded-ids';
import type {
  MinistryParticipation,
  ParticipationState,
} from '../../entities/ministry-participation';
import type { ParticipationSlotInclusion } from '../../entities/participation-slot-inclusion';
import type { TransactionContext } from './transaction-context';

export interface GetParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface FindParticipationByMinistryEventInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface CreateParticipationInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListParticipationsByEventInput {
  churchId: ChurchId;
  eventId: EventId;
  tx?: TransactionContext;
}

export interface ListParticipationsByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  state?: ParticipationState;
  tx?: TransactionContext;
}

export interface ListParticipationsByIdsInput {
  churchId: ChurchId;
  participationIds: MinistryParticipationId[];
  tx?: TransactionContext;
}

export interface UpdateParticipationStateInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  state: ParticipationState;
  tx?: TransactionContext;
}

export interface ListInclusionsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ReplaceInclusionsInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotIds: TimeSlotId[];
  tx?: TransactionContext;
}

export interface AddInclusionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  timeSlotId: TimeSlotId;
  tx?: TransactionContext;
}

export interface TouchParticipationInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
  tx?: TransactionContext;
}

export interface ListMinistryCycleSummariesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

/** Iteration 3 (research.md R15/R16): one row per locked `PlanningCycle`
 * church-wide, annotated with this ministry's participation data. A cycle
 * the ministry has zero events in still appears, with `isPartOf: false`. */
export interface MinistryCycleSummaryRow {
  cycleId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isPartOf: boolean;
  eventCount: number;
  slotCount: number;
  status: 'not_started' | 'in_progress' | 'published';
  availabilityFiredForAll: boolean;
  availabilityFiredForAny: boolean;
}

export interface MinistryParticipationRepository {
  getById(input: GetParticipationInput): Promise<MinistryParticipation>;
  findByMinistryEvent(
    input: FindParticipationByMinistryEventInput,
  ): Promise<MinistryParticipation | null>;
  create(input: CreateParticipationInput): Promise<MinistryParticipation>;
  listByEvent(
    input: ListParticipationsByEventInput,
  ): Promise<MinistryParticipation[]>;
  listByMinistry(
    input: ListParticipationsByMinistryInput,
  ): Promise<MinistryParticipation[]>;
  listByIds(
    input: ListParticipationsByIdsInput,
  ): Promise<MinistryParticipation[]>;
  updateState(
    input: UpdateParticipationStateInput,
  ): Promise<MinistryParticipation>;
  listInclusions(
    input: ListInclusionsInput,
  ): Promise<ParticipationSlotInclusion[]>;
  replaceInclusions(input: ReplaceInclusionsInput): Promise<void>;
  addInclusion(input: AddInclusionInput): Promise<void>;
  touch(input: TouchParticipationInput): Promise<void>;
  listMinistryCycleSummaries(
    input: ListMinistryCycleSummariesInput,
  ): Promise<MinistryCycleSummaryRow[]>;
}

import type {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
  UserId,
} from '../../branded-ids';
import type { EventWithEventTimeBlocks } from '../../entities/event';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { IChurchNotifications } from './church-notifications';
import type {
  IScheduleChangeReader,
  ParticipationStaffingView,
} from './schedule-change-reader';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type {
  MinistryParticipationRepository,
  ScheduleLastToldRow,
} from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { SwapRequestRepository } from '@/domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

export interface PublishCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  userId: UserId;
  confirmBelowFull?: boolean;
}

export interface SendScheduleUpdatesView {
  notifiedCount: number;
}

export interface PublishCycleParticipationOutcome {
  participationId: MinistryParticipationId;
  state: MinistryParticipation['state'];
  peopleNeeded: number;
  assignedCount: number;
}

export interface PublishCycleView {
  published: boolean;
  belowFull: boolean;
  participations: PublishCycleParticipationOutcome[];
  /** Set only on a below-full refusal: the places still to fill. */
  gapCount?: number;
}

export interface TagCoveredSwapRequestsInput {
  baseline: ScheduleLastToldRow[];
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface PublishCandidate {
  participation: MinistryParticipation;
  completion: ParticipationStaffingView;
}

export interface NotifySchedulePublishedInput {
  input: PublishCycleInput;
  candidates: PublishCandidate[];
  events: EventWithEventTimeBlocks[];
  tx: TransactionContext;
}

export interface DbSchedulePublisherDependencies {
  churchRepository: ChurchRepository;
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  ministryRepository: MinistryRepository;
  notifications: IChurchNotifications;
  participationRepository: MinistryParticipationRepository;
  swapRequestRepo: SwapRequestRepository;
  unitOfWork: UnitOfWork;
  volunteerRepository: VolunteerRepository;
  scheduleChangeReader: IScheduleChangeReader;
}

export interface ISchedulePublisher {
  publishCycle(input: PublishCycleInput): Promise<PublishCycleView>;
  sendScheduleUpdates(
    input: PublishCycleInput,
  ): Promise<SendScheduleUpdatesView>;
}

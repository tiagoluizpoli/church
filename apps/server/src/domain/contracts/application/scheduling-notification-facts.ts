import type {
  AvailabilityDeliveryFacts,
  CycleReadyToPrepareDeliveryFacts,
  NotificationRequestDataOf,
} from '../../notification-kinds';
import type { ChurchRecipient } from './church-notifications';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';

export interface SchedulingNotificationFactsDependencies {
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  /** Base URL of the web app, for deep links. */
  webBaseUrl: string;
}

export interface ResolveAvailabilityInput {
  churchId: ChurchRecipient['churchId'];
  userId: ChurchRecipient['userId'];
  data: NotificationRequestDataOf<'availability_opened'>;
}

export interface ResolveCycleReadyToPrepareInput {
  churchId: ChurchRecipient['churchId'];
  data: NotificationRequestDataOf<'cycle_ready_to_prepare'>;
}

export interface ISchedulingNotificationFacts {
  availability(
    input: ResolveAvailabilityInput,
  ): Promise<AvailabilityDeliveryFacts | null>;
  cycleReadyToPrepare(
    input: ResolveCycleReadyToPrepareInput,
  ): Promise<CycleReadyToPrepareDeliveryFacts | null>;
}

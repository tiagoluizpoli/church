import type {
  OutboxEmailDelivery,
  OutboxRepository,
} from '@/domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface EmailRoutingForInput {
  id: string;
  delivery: OutboxEmailDelivery;
  outboxRepository: OutboxRepository;
  unitOfWork: UnitOfWork;
}

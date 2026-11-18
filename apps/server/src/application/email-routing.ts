import type { EmailRouting } from '../domain/contracts/infrastructure/email-sender';
import type {
  OutboxEmailDelivery,
  OutboxRepository,
} from '../domain/contracts/infrastructure/outbox.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

export interface EmailRoutingForInput {
  id: string;
  delivery: OutboxEmailDelivery;
  outboxRepository: OutboxRepository;
  unitOfWork: UnitOfWork;
}

/** An outbox row's frozen mode and confirmations; each new confirmation
 * commits on its own, so a later failure cannot lose it. */
export function emailRoutingFor({
  id,
  delivery,
  outboxRepository,
  unitOfWork,
}: EmailRoutingForInput): EmailRouting {
  return {
    frozenMode: delivery.frozenMode,
    confirmed: delivery.confirmedDestinations,
    confirm: ({ destination }) =>
      unitOfWork.run((tx) =>
        outboxRepository.recordEmailDestinationConfirmed({
          id,
          destination,
          tx,
        }),
      ),
  };
}

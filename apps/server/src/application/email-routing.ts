import type { EmailRoutingForInput } from '../domain/contracts/application/email-routing';
import type { EmailRouting } from '../domain/contracts/infrastructure/email-sender';

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
